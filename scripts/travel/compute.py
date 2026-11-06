"""Works out commute times ahead of time, from everywhere in the city to every school.

The city is divided into a grid of roughly 300 m squares (0.0027° of latitude by
0.0036° of longitude); only squares whose center is on land are kept. For every
square, R5 (through r5py) computes the trip to every school:

  transit  median trip for departures between 7 and 8 on a Tuesday morning,
           walking at 3 mph, subway, buses and the Staten Island Ferry
           (no NYC Ferry, commuter rail or school buses), cut off at 2 hours
  walk     on foot at 3 mph, cut off at 90 minutes
  drive    no traffic, on larger 2×2 squares, cut off at 90 minutes

Results are stored as one byte per minute (255 means unreachable) in block
files of 6×6 squares, so a visitor only downloads the block around their home:

  public/data/travel/index.json      describes the grid
  public/data/travel/b/<row>-<col>.bin  mode × square × school bytes

Partial results are saved in .travel/output, so an interrupted run resumes.

Usage (through npm run travel): python -I compute.py [--limit N]
"""

import argparse
import csv
import hashlib
import datetime as dt
import io
import json
import math
import os
import sys
import time
import zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
T = ROOT / ".travel"
OUT = ROOT / "public" / "data" / "travel"
WORK = T / "output"

LAT0, LON0 = 40.477, -74.26
DLAT, DLON = 0.0027, 0.0036
ROWS, COLS = 164, 156
BLOCK = 6
DRIVE_CELL = 2
MODES = ["transit", "walk", "drive"]
CUTOFFS = {"transit": 120, "walk": 90, "drive": 90}
UNREACHABLE = 255
WALK_KMH = 4.828  # 3 mph
CHUNK = 600


def log(*args):
    print(time.strftime("%H:%M:%S"), *args, flush=True)


def land_cells():
    from shapely import make_valid
    from shapely.geometry import shape, Point
    from shapely.prepared import prep

    geo = json.loads((ROOT / "public" / "data" / "districts.geojson").read_text())
    outlines = [prep(make_valid(shape(f["geometry"]))) for f in geo["features"]]
    cells = []
    for r in range(ROWS):
        lat = LAT0 + (r + 0.5) * DLAT
        for c in range(COLS):
            lon = LON0 + (c + 0.5) * DLON
            if any(o.contains(Point(lon, lat)) for o in outlines):
                cells.append((r, c))
    return cells


def tuesday_for(feeds):
    """The first Tuesday after today that every timetable runs on."""
    ranges = []
    for f in feeds:
        with zipfile.ZipFile(f) as z:
            rows = list(csv.DictReader(io.TextIOWrapper(z.open("calendar.txt"), "utf-8-sig")))
            removed = set()
            if "calendar_dates.txt" in z.namelist():
                for d in csv.DictReader(io.TextIOWrapper(z.open("calendar_dates.txt"), "utf-8-sig")):
                    if d.get("exception_type") == "2":
                        removed.add((d["service_id"], d["date"]))
        ranges.append((rows, removed))
    day = dt.date.today() + dt.timedelta(days=1)
    for _ in range(120):
        if day.weekday() == 1:
            key = day.strftime("%Y%m%d")
            if all(
                any(r["tuesday"] == "1" and r["start_date"] <= key <= r["end_date"] and (r["service_id"], key) not in removed for r in rows)
                for rows, removed in ranges
            ):
                return day
        day += dt.timedelta(days=1)
    raise SystemExit("No Tuesday is covered by every timetable in the next four months")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="only route the first N squares (for testing)")
    args, _ = ap.parse_known_args()

    import geopandas as gpd
    import r5py
    from shapely.geometry import Point

    schools = json.loads((ROOT / "public" / "data" / "schools.json").read_text())
    school_ids = [s["id"] for s in schools]
    feeds = sorted(str(p) for p in (T / "input" / "gtfs").glob("*.zip"))
    day = tuesday_for(feeds)
    departure = dt.datetime.combine(day, dt.time(7, 0))
    log(f"{len(schools)} schools, {len(feeds)} timetables, departing {departure:%A %Y-%m-%d} 7:00–8:00")

    cells = land_cells()
    log(f"{len(cells)} land squares")
    out = OUT
    if args.limit:
        # Test runs route a slice of the city from the middle and write elsewhere.
        mid = len(cells) // 2
        cells = cells[mid : mid + args.limit]
        out = WORK / "test-out"

    # Driving uses larger squares: the land squares inside each 2×2 group share one origin.
    groups = {}
    for r, c in cells:
        groups.setdefault((r // DRIVE_CELL, c // DRIVE_CELL), []).append((r, c))
    drive_origins = []
    for key, members in groups.items():
        lat = sum(LAT0 + (r + 0.5) * DLAT for r, _ in members) / len(members)
        lon = sum(LON0 + (c + 0.5) * DLON for _, c in members) / len(members)
        drive_origins.append((key, lat, lon))

    destinations = gpd.GeoDataFrame(
        {"id": list(range(len(schools)))},
        geometry=[Point(s["lon"], s["lat"]) for s in schools],
        crs="EPSG:4326",
    )

    log("building the transport network (cached after the first run)…")
    network = r5py.TransportNetwork(str(T / "input" / "nyc.osm.pbf"), feeds)

    WORK.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(json.dumps([school_ids, cells]).encode()).hexdigest()[:10]
    signature = f"{len(cells)}-{len(schools)}-{day}-{digest}"

    def run(mode, origins):
        """origins: list of (lat, lon). Returns uint8 array [len(origins), schools]."""
        result = np.full((len(origins), len(schools)), UNREACHABLE, dtype=np.uint8)
        for start in range(0, len(origins), CHUNK):
            part = WORK / f"{mode}-{signature}-{start}.npy"
            chunk = origins[start : start + CHUNK]
            if part.exists():
                result[start : start + len(chunk)] = np.load(part)
                continue
            t0 = time.time()
            frame = gpd.GeoDataFrame(
                {"id": list(range(len(chunk)))},
                geometry=[Point(lon, lat) for lat, lon in chunk],
                crs="EPSG:4326",
            )
            common = dict(
                origins=frame,
                destinations=destinations,
                snap_to_network=True,
                departure=departure,
                speed_walking=WALK_KMH,
                max_time=dt.timedelta(minutes=CUTOFFS[mode]),
            )
            if mode == "transit":
                ttm = r5py.TravelTimeMatrix(
                    network,
                    transport_modes=[r5py.TransportMode.TRANSIT, r5py.TransportMode.WALK],
                    departure_time_window=dt.timedelta(hours=1),
                    percentiles=[50],
                    **common,
                )
            elif mode == "walk":
                ttm = r5py.TravelTimeMatrix(network, transport_modes=[r5py.TransportMode.WALK], **common)
            else:
                ttm = r5py.TravelTimeMatrix(
                    network,
                    transport_modes=[r5py.TransportMode.CAR],
                    max_time_driving=dt.timedelta(minutes=CUTOFFS[mode]),
                    **common,
                )
            block = np.full((len(chunk), len(schools)), UNREACHABLE, dtype=np.uint8)
            ok = ttm["travel_time"].notna() & (ttm["travel_time"] <= CUTOFFS[mode])
            sub = ttm[ok]
            block[sub["from_id"].to_numpy(int), sub["to_id"].to_numpy(int)] = np.clip(
                np.round(sub["travel_time"].to_numpy(float)), 0, 254
            ).astype(np.uint8)
            np.save(part, block)
            result[start : start + len(chunk)] = block
            done = min(start + CHUNK, len(origins))
            log(f"  {mode}: {done}/{len(origins)} squares ({time.time() - t0:.0f}s for this chunk)")
        return result

    started = time.time()
    origins = [(LAT0 + (r + 0.5) * DLAT, LON0 + (c + 0.5) * DLON) for r, c in cells]
    times = {}
    log("walking…")
    times["walk"] = run("walk", origins)
    log("transit…")
    times["transit"] = run("transit", origins)
    log("driving…")
    drive = run("drive", [(lat, lon) for _, lat, lon in drive_origins])
    by_group = {key: i for i, (key, _, _) in enumerate(drive_origins)}
    times["drive"] = np.stack([drive[by_group[(r // DRIVE_CELL, c // DRIVE_CELL)]] for r, c in cells])

    # A trip on foot is also a trip by transit.
    times["transit"] = np.minimum(times["transit"], times["walk"])

    # Pack 6×6 blocks. Water squares inside a block take the nearest land square
    # within two squares, so a pin on a pier or shoreline still gets an estimate.
    index_of = {cell: i for i, cell in enumerate(cells)}
    blocks = sorted({(r // BLOCK, c // BLOCK) for r, c in cells})
    if (out / "b").exists():
        for old in (out / "b").glob("*.bin"):
            old.unlink()
    (out / "b").mkdir(parents=True, exist_ok=True)
    n = len(schools)
    total = 0
    for br, bc in blocks:
        buf = np.full((len(MODES), BLOCK * BLOCK, n), UNREACHABLE, dtype=np.uint8)
        for k in range(BLOCK * BLOCK):
            r, c = br * BLOCK + k // BLOCK, bc * BLOCK + k % BLOCK
            i = index_of.get((r, c))
            if i is None:
                near = [
                    (max(abs(dr), abs(dc)), index_of[(r + dr, c + dc)])
                    for dr in range(-2, 3)
                    for dc in range(-2, 3)
                    if (r + dr, c + dc) in index_of
                ]
                if not near:
                    continue
                i = min(near)[1]
            for m, mode in enumerate(MODES):
                buf[m, k] = times[mode][i]
        path = out / "b" / f"{br}-{bc}.bin"
        path.write_bytes(buf.tobytes())
        total += path.stat().st_size

    index = {
        "version": 1,
        "built": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "lat0": LAT0,
        "lon0": LON0,
        "dlat": DLAT,
        "dlon": DLON,
        "rows": ROWS,
        "cols": COLS,
        "block": BLOCK,
        "modes": MODES,
        "schools": school_ids,
        "blocks": [f"{br}-{bc}" for br, bc in blocks],
        "cells": len(cells),
        "unreachable": UNREACHABLE,
        "departure": departure.strftime("%Y-%m-%dT%H:%M"),
        "windowMinutes": 60,
        "cutoffs": CUTOFFS,
        "driveCell": DRIVE_CELL,
        "feeds": [Path(f).name for f in feeds],
    }
    (out / "index.json").write_text(json.dumps(index))
    reach = {m: float((times[m] != UNREACHABLE).mean()) for m in MODES}
    log(f"wrote {len(blocks)} blocks ({total / 1e6:.1f} MB) in {(time.time() - started) / 60:.0f} min; reachable share {reach}")


if __name__ == "__main__":
    sys.exit(main())
