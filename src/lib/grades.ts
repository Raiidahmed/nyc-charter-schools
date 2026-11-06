// Grades are numbers: -1 is Pre-K, 0 is kindergarten, 1–12 as usual.

export type Band = 'elementary' | 'middle' | 'high';

export const PRE_K = -1;
export const KINDERGARTEN = 0;

export const BANDS: { id: Band; label: string; low: number; high: number }[] = [
  { id: 'elementary', label: 'Elementary', low: PRE_K, high: 5 },
  { id: 'middle', label: 'Middle', low: 6, high: 8 },
  { id: 'high', label: 'High', low: 9, high: 12 },
];

/** Parses federal grade codes: PK, KG, 01–12. Returns null for anything else. */
export function parseGrade(code: string | null | undefined): number | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (c === 'PK') return PRE_K;
  if (c === 'KG') return KINDERGARTEN;
  if (/^\d{1,2}$/.test(c)) {
    const n = Number(c);
    return n >= 1 && n <= 12 ? n : null;
  }
  return null;
}

/** A school belongs to every band its grades touch. */
export function bandsFor(low: number, high: number): Band[] {
  return BANDS.filter((b) => low <= b.high && high >= b.low).map((b) => b.id);
}

export function gradeName(g: number): string {
  if (g === PRE_K) return 'Pre-K';
  if (g === KINDERGARTEN) return 'K';
  return String(g);
}

/** Long form for sentences and menus: "Pre-K", "Kindergarten", "6th grade". */
export function gradeLongName(g: number): string {
  if (g === PRE_K) return 'Pre-K';
  if (g === KINDERGARTEN) return 'Kindergarten';
  const suffix = g === 1 ? 'st' : g === 2 ? 'nd' : g === 3 ? 'rd' : 'th';
  return `${g}${suffix} grade`;
}

/** "K–5", "Pre-K–8", "9–12". */
export function gradeRange(low: number, high: number): string {
  return low === high ? gradeName(low) : `${gradeName(low)}–${gradeName(high)}`;
}

export const ALL_GRADES = Array.from({ length: 14 }, (_, i) => i - 1);
