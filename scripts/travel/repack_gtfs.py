"""Repack a GTFS zip so R5 will read it.

The Staten Island Ferry feed from nyc.gov has three problems: its files sit
inside a folder rather than at the top of the zip, they start with byte order
marks, and some tables are empty (no rows, sometimes no header). R5 rejects
all three, so this flattens the folder, strips the marks and drops the empty
tables.

Usage: python -I repack_gtfs.py <input.zip> <output.zip>
"""

import os
import sys
import zipfile


def main(src: str, dest: str) -> None:
    kept = []
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dest + ".part", "w", zipfile.ZIP_DEFLATED) as zout:
        for info in zin.infolist():
            if info.is_dir():
                continue
            name = os.path.basename(info.filename)
            if not name.endswith(".txt") or name.startswith("."):
                continue
            text = zin.read(info).decode("utf-8-sig").replace("\r\n", "\n")
            lines = [line for line in text.split("\n") if line.strip()]
            if len(lines) < 2:
                continue
            zout.writestr(name, "\n".join(lines) + "\n")
            kept.append(f"{name} ({len(lines) - 1} rows)")
    os.replace(dest + ".part", dest)
    print("repacked:", ", ".join(kept))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
