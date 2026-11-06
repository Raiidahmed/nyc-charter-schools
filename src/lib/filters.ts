// Filtering rules. Options within a filter widen the results; different
// filters narrow them. Filters that need a home do nothing until there is one,
// and the commute filter also waits for the travel data.
import type { Band } from './grades.ts';
import { BANDS, gradeLongName } from './grades.ts';
import { milesBetween } from './geo.ts';
import { authorizerInfo, modeInfo, ratingInfo, SCHOOL_TYPES } from './labels.ts';
import { lineLabel } from './subway.ts';
import { commuteFor, type Trips } from './travel.ts';
import type { Authorizer, Borough, Rating, School, SchoolType, TravelMode } from './types.ts';

export type Size = 'small' | 'medium' | 'large' | 'xlarge';
export type YearsOpen = 'new' | 'established';

export interface Filters {
  // Grades
  bands: Band[];
  entering: number | null;
  through: 8 | 12 | null;
  preK: boolean;
  // Location: these need a home
  maxMiles: number | null;
  maxCommute: number | null;
  commuteMode: TravelMode;
  myDistrict: boolean;
  // Location: always available
  subwayWalk: number | null;
  lines: string[];
  accessible: boolean;
  boroughs: Borough[];
  // School profile
  sizes: Size[];
  maxRatio: number | null;
  types: SchoolType[];
  /** null for all, "any" for any network, "independent", or a network's name. */
  network: string | null;
  years: YearsOpen[];
  // Oversight
  authorizers: Authorizer[];
  ratings: Rating[];
}

export const DEFAULT_FILTERS: Filters = {
  bands: [],
  entering: null,
  through: null,
  preK: false,
  maxMiles: null,
  maxCommute: null,
  commuteMode: 'transit',
  myDistrict: false,
  subwayWalk: null,
  lines: [],
  accessible: false,
  boroughs: [],
  sizes: [],
  maxRatio: null,
  types: [],
  network: null,
  years: [],
  authorizers: [],
  ratings: [],
};

export const MILE_OPTIONS = [0.5, 1, 2, 3, 5];
export const COMMUTE_OPTIONS = [15, 30, 45, 60];
export const SUBWAY_WALK_OPTIONS = [5, 10, 15];
export const RATIO_OPTIONS = [10, 12, 15];

export const SIZES: { id: Size; label: string; range: string; min: number; max: number }[] = [
  { id: 'small', label: 'Small', range: 'under 300', min: 0, max: 299 },
  { id: 'medium', label: 'Medium', range: '300–599', min: 300, max: 599 },
  { id: 'large', label: 'Large', range: '600–999', min: 600, max: 999 },
  { id: 'xlarge', label: 'Very large', range: '1,000 or more', min: 1000, max: Infinity },
];

export function sizeOf(enrollment: number | null): Size | null {
  if (enrollment === null) return null;
  return SIZES.find((s) => enrollment >= s.min && enrollment <= s.max)?.id ?? null;
}

export interface HomePlace {
  lat: number;
  lon: number;
  label: string;
  district: number | null;
  source: 'address' | 'location' | 'pin';
}

export interface FilterContext {
  home: HomePlace | null;
  distances: Map<string, number> | null;
  trips: Trips | null;
  now: Date;
}

export function distancesFrom(home: HomePlace, schools: School[]): Map<string, number> {
  return new Map(schools.map((s) => [s.id, milesBetween(home.lat, home.lon, s.lat, s.lon)]));
}

// --- Years open, counting school years from July ------------------------------------
export function schoolYearStart(now: Date): number {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/** New: opened in the last two school years (or this one). */
export function newSince(now: Date): number {
  return schoolYearStart(now) - 2;
}

/** Established: opened ten or more school years ago. */
export function establishedBy(now: Date): number {
  return schoolYearStart(now) - 10;
}

export function yearsOpenOf(opened: number, now: Date): YearsOpen | null {
  if (opened >= newSince(now)) return 'new';
  if (opened <= establishedBy(now)) return 'established';
  return null;
}

// --- Matching ------------------------------------------------------------------------
export type FilterKey = Exclude<keyof Filters, 'commuteMode'>;

const HOME_KEYS: FilterKey[] = ['maxMiles', 'maxCommute', 'myDistrict'];

/** Whether a filter is set and can apply right now. */
export function isActive(f: Filters, key: FilterKey, ctx: FilterContext): boolean {
  const v = f[key];
  const set = Array.isArray(v) ? v.length > 0 : v !== null && v !== false;
  if (!set) return false;
  if (HOME_KEYS.includes(key) && !ctx.home) return false;
  if (key === 'myDistrict' && ctx.home?.district == null) return false;
  if (key === 'maxCommute' && !ctx.trips) return false;
  return true;
}

function stationOk(school: School, f: Filters, ctx: FilterContext, skip?: FilterKey): boolean {
  const walk = skip !== 'subwayWalk' && isActive(f, 'subwayWalk', ctx) ? f.subwayWalk : null;
  const lines = skip !== 'lines' && isActive(f, 'lines', ctx) ? f.lines : null;
  const accessible = skip !== 'accessible' && isActive(f, 'accessible', ctx);
  if (walk === null && !lines && !accessible) return true;
  return school.stations.some(
    (st) =>
      (walk === null || st.walk <= walk) &&
      (!lines || st.lines.some((l) => lines.includes(l))) &&
      (!accessible || st.access === 'full'),
  );
}

export function matches(school: School, f: Filters, ctx: FilterContext, skip?: FilterKey): boolean {
  const on = (key: FilterKey) => key !== skip && isActive(f, key, ctx);
  if (on('bands') && !school.bands.some((b) => f.bands.includes(b))) return false;
  if (on('entering') && !(school.gradeLow <= f.entering! && f.entering! <= school.gradeHigh)) return false;
  if (on('through') && !(school.gradeLow <= f.through! && f.through! <= school.gradeHigh)) return false;
  if (on('preK') && school.gradeLow > -1) return false;
  if (on('maxMiles') && !((ctx.distances?.get(school.id) ?? Infinity) <= f.maxMiles!)) return false;
  if (on('maxCommute')) {
    const t = commuteFor(ctx.trips!.get(school.id), f.commuteMode);
    if (t === null || t > f.maxCommute!) return false;
  }
  if (on('myDistrict') && school.district !== ctx.home!.district) return false;
  if (!stationOk(school, f, ctx, skip)) return false;
  if (on('boroughs') && !f.boroughs.includes(school.borough)) return false;
  if (on('sizes')) {
    const size = sizeOf(school.enrollment);
    if (!size || !f.sizes.includes(size)) return false;
  }
  if (on('maxRatio') && !(school.ratio !== null && school.ratio <= f.maxRatio!)) return false;
  if (on('types') && !f.types.includes(school.type)) return false;
  if (on('network')) {
    if (f.network === 'any' && !school.network) return false;
    if (f.network === 'independent' && school.network) return false;
    if (f.network !== 'any' && f.network !== 'independent' && school.network !== f.network) return false;
  }
  if (on('years')) {
    const y = yearsOpenOf(school.opened, ctx.now);
    if (!y || !f.years.includes(y)) return false;
  }
  if (on('authorizers') && !f.authorizers.includes(school.authorizer)) return false;
  if (on('ratings') && !(school.rating && f.ratings.includes(school.rating))) return false;
  return true;
}

export function applyFilters(schools: School[], f: Filters, ctx: FilterContext): School[] {
  return schools.filter((s) => matches(s, f, ctx));
}

/** How many schools a filter value would leave, given every other filter. */
export function countWith<K extends FilterKey>(schools: School[], f: Filters, ctx: FilterContext, key: K, value: Filters[K]): number {
  const next = { ...f, [key]: value };
  let n = 0;
  for (const s of schools) if (matches(s, next, ctx, undefined)) n++;
  return n;
}

export function activeCount(f: Filters, ctx: FilterContext): number {
  return chipsFor(f, ctx).length;
}

export function clearAll(f: Filters): Filters {
  return { ...DEFAULT_FILTERS, commuteMode: f.commuteMode };
}

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

// --- Chips -----------------------------------------------------------------------------
export interface Chip {
  id: string;
  label: string;
  /** The filters with this chip removed. */
  without: Filters;
}

export function milesLabel(m: number): string {
  return m === 0.5 ? '½ mi' : `${m} mi`;
}

export function commuteLabel(minutes: number, mode: TravelMode): string {
  if (mode === 'drive') return `≤ ${minutes} min by car at rush hour`;
  return `≤ ${minutes} min ${modeInfo(mode).by}`;
}

export function networkLabel(network: string): string {
  if (network === 'any') return 'Any network';
  if (network === 'independent') return 'Independent';
  return network;
}

export function yearsLabel(y: YearsOpen, now: Date): string {
  return y === 'new' ? `New (opened ${newSince(now)} or later)` : `Established (opened ${establishedBy(now)} or earlier)`;
}

export function chipsFor(f: Filters, ctx: FilterContext): Chip[] {
  const chips: Chip[] = [];
  const add = (id: string, label: string, without: Partial<Filters>) => chips.push({ id, label, without: { ...f, ...without } });
  const on = (key: FilterKey) => isActive(f, key, ctx);

  if (on('bands'))
    for (const b of f.bands) add(`band-${b}`, `${BANDS.find((x) => x.id === b)!.label} school`, { bands: f.bands.filter((x) => x !== b) });
  if (on('entering')) add('entering', `Entering ${gradeLongName(f.entering!).replace(/^K/, 'k')}`, { entering: null });
  if (on('through')) add('through', `Continues through ${f.through}th grade`, { through: null });
  if (on('preK')) add('prek', 'Offers Pre-K', { preK: false });
  if (on('maxMiles')) add('miles', `Within ${milesLabel(f.maxMiles!)}`, { maxMiles: null });
  if (on('maxCommute')) add('commute', commuteLabel(f.maxCommute!, f.commuteMode), { maxCommute: null });
  if (on('myDistrict')) add('district', `In my district (District ${ctx.home!.district})`, { myDistrict: false });
  if (on('subwayWalk')) add('walk', `≤ ${f.subwayWalk} min walk to the subway`, { subwayWalk: null });
  if (on('lines')) for (const l of f.lines) add(`line-${l}`, lineLabel(l), { lines: f.lines.filter((x) => x !== l) });
  if (on('accessible')) add('accessible', 'Accessible stations', { accessible: false });
  if (on('boroughs')) for (const b of f.boroughs) add(`borough-${b}`, b, { boroughs: f.boroughs.filter((x) => x !== b) });
  if (on('sizes'))
    for (const s of f.sizes) {
      const info = SIZES.find((x) => x.id === s)!;
      add(`size-${s}`, `${info.label} (${info.range})`, { sizes: f.sizes.filter((x) => x !== s) });
    }
  if (on('maxRatio')) add('ratio', `Ratio ${f.maxRatio}:1 or lower`, { maxRatio: null });
  if (on('types'))
    for (const t of f.types) add(`type-${t}`, SCHOOL_TYPES.find((x) => x.id === t)!.plural, { types: f.types.filter((x) => x !== t) });
  if (on('network')) add('network', networkLabel(f.network!), { network: null });
  if (on('years')) for (const y of f.years) add(`years-${y}`, yearsLabel(y, ctx.now), { years: f.years.filter((x) => x !== y) });
  if (on('authorizers'))
    for (const a of f.authorizers) add(`auth-${a}`, authorizerInfo(a).short, { authorizers: f.authorizers.filter((x) => x !== a) });
  if (on('ratings'))
    for (const r of f.ratings) add(`rating-${r}`, ratingInfo(r).label, { ratings: f.ratings.filter((x) => x !== r) });
  return chips;
}

/** Which filter groups have something active, for the filter buttons. */
export const GROUP_KEYS: Record<'grades' | 'location' | 'profile' | 'oversight', FilterKey[]> = {
  grades: ['bands', 'entering', 'through', 'preK'],
  location: ['maxMiles', 'maxCommute', 'myDistrict', 'subwayWalk', 'lines', 'accessible', 'boroughs'],
  profile: ['sizes', 'maxRatio', 'types', 'network', 'years'],
  oversight: ['authorizers', 'ratings'],
};

export function groupActiveCount(group: keyof typeof GROUP_KEYS, f: Filters, ctx: FilterContext): number {
  return GROUP_KEYS[group].reduce((n, key) => {
    if (!isActive(f, key, ctx)) return n;
    const v = f[key];
    return n + (Array.isArray(v) ? v.length : 1);
  }, 0);
}

