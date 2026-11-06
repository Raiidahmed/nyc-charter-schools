// The MTA's line colors, in the order the MTA lists them.

const GROUPS: [string, string[]][] = [
  ['#EE352E', ['1', '2', '3']],
  ['#00933C', ['4', '5', '6']],
  ['#B933AD', ['7']],
  ['#0039A6', ['A', 'C', 'E']],
  ['#FF6319', ['B', 'D', 'F', 'M']],
  ['#6CBE45', ['G']],
  ['#996633', ['J', 'Z']],
  ['#A7A9AC', ['L']],
  ['#FCCC0A', ['N', 'Q', 'R', 'W']],
  ['#808183', ['S']],
  ['#0039A6', ['SIR']],
];

export const LINE_ORDER: string[] = GROUPS.flatMap(([, lines]) => lines);

export const LINE_COLORS: Record<string, string> = Object.fromEntries(
  GROUPS.flatMap(([color, lines]) => lines.map((l) => [l, color])),
);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on the line's color. */
export function lineTextColor(line: string): string {
  const bg = LINE_COLORS[line] ?? '#808183';
  return contrast(bg, '#ffffff') >= contrast(bg, '#000000') ? '#ffffff' : '#000000';
}

export function lineLabel(line: string): string {
  if (line === 'S') return 'Shuttle';
  if (line === 'SIR') return 'Staten Island Railway';
  return `${line} train`;
}

export function sortLines(lines: Iterable<string>): string[] {
  return [...new Set(lines)].toSorted((a, b) => LINE_ORDER.indexOf(a) - LINE_ORDER.indexOf(b));
}
