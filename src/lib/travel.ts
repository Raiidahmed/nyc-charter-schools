// Looks up precomputed commute times. The city is a grid of ~300 m squares,
// stored in 6×6 block files of one byte per minute (255 means unreachable).
import { inCongestionZone } from './geo.ts';
import type { School, TravelIndex, TravelMode } from './types.ts';

/** No-traffic driving times become rush-hour times in the browser. */
export const RUSH_FACTOR = 1.5;
/** Trips that start or end in Manhattan's congestion zone, roughly south of 60th Street. */
export const ZONE_RUSH_FACTOR = 2;

export interface Trip {
  transit: number | null;
  walk: number | null;
  /** Driving with no traffic. */
  drive: number | null;
  /** Driving at rush hour, used for filters and sorting. */
  driveRush: number | null;
}

export type Trips = Map<string, Trip>;

export interface Cell {
  row: number;
  col: number;
  block: string;
  /** Position of the square inside its block. */
  slot: number;
}

export function cellFor(index: TravelIndex, lat: number, lon: number): Cell | null {
  const row = Math.floor((lat - index.lat0) / index.dlat);
  const col = Math.floor((lon - index.lon0) / index.dlon);
  if (row < 0 || col < 0 || row >= index.rows || col >= index.cols) return null;
  const block = `${Math.floor(row / index.block)}-${Math.floor(col / index.block)}`;
  if (!index.blocks.includes(block)) return null;
  return { row, col, block, slot: (row % index.block) * index.block + (col % index.block) };
}

export function rushHour(noTraffic: number, homeInZone: boolean, schoolInZone: boolean): number {
  return Math.round(noTraffic * (homeInZone || schoolInZone ? ZONE_RUSH_FACTOR : RUSH_FACTOR));
}

/** Reads one square's times to every school out of a block file. */
export function readTrips(
  index: TravelIndex,
  bytes: Uint8Array,
  slot: number,
  home: { lat: number; lon: number; district: number | null },
  schools: School[],
): Trips {
  const n = index.schools.length;
  const perMode = index.block * index.block * n;
  const position = new Map(index.schools.map((id, i) => [id, i]));
  const at = (mode: TravelMode, j: number) => {
    const m = index.modes.indexOf(mode);
    if (m < 0) return null;
    const v = bytes[m * perMode + slot * n + j];
    // A school in the same square as home still takes at least a minute.
    return v === undefined || v === index.unreachable ? null : Math.max(1, v);
  };
  const homeInZone = inCongestionZone(home.lat, home.lon, home.district);
  const trips: Trips = new Map();
  for (const s of schools) {
    const j = position.get(s.id);
    if (j === undefined) continue;
    const drive = at('drive', j);
    trips.set(s.id, {
      transit: at('transit', j),
      walk: at('walk', j),
      drive,
      driveRush: drive === null ? null : rushHour(drive, homeInZone, inCongestionZone(s.lat, s.lon, s.district)),
    });
  }
  return trips;
}

/** The time used for filters and sorting: rush hour for driving. */
export function commuteFor(trip: Trip | undefined, mode: TravelMode): number | null {
  if (!trip) return null;
  if (mode === 'drive') return trip.driveRush;
  return trip[mode];
}
