// Shareable links. Everything that isn't personal goes in the address: every
// filter that doesn't need a home, the search, the open school and the sort.
// The home, and distance, district and commute filters, never do. Defaults
// are left out and unknown values are ignored. Links from earlier versions
// carried layout and view settings; they are never read, so rewriting the
// address drops them.
import { DEFAULT_FILTERS, type Filters, type Size, type YearsOpen } from './filters.ts';
import { BANDS, type Band } from './grades.ts';
import { BOROUGHS, boroughSlug } from './labels.ts';
import { DEFAULT_SORT, HOME_SORTS, SORTS, type SortKey } from './sort.ts';
import type { Authorizer, Borough, Rating, SchoolType } from './types.ts';

export interface LinkState {
  filters: Filters;
  query: string;
  school: string | null;
  sort: SortKey;
}

export interface LinkContext {
  schoolIds: Set<string>;
  networks: Set<string>;
  lines: Set<string>;
}

const SIZES: Size[] = ['small', 'medium', 'large', 'xlarge'];
const TYPES: SchoolType[] = ['general', 'special', 'transfer'];
const YEARS: YearsOpen[] = ['new', 'established'];
const AUTHORIZERS: Record<string, Authorizer> = { suny: 'SUNY', nycps: 'NYCPS', regents: 'Regents' };
const RATINGS: Rating[] = ['local', 'tsi', 'atsi', 'csi'];
const BAND_IDS = BANDS.map((b) => b.id);

const gradeCode = (g: number) => (g === -1 ? 'pk' : g === 0 ? 'k' : String(g));
function parseGradeCode(v: string | null): number | null {
  if (v === null) return null;
  if (v === 'pk') return -1;
  if (v === 'k') return 0;
  return /^\d{1,2}$/.test(v) && +v >= 1 && +v <= 12 ? +v : null;
}

function list<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]): T[] {
  const raw = params.get(key);
  if (!raw) return [];
  return [...new Set(raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v)))];
}

function oneOf(params: URLSearchParams, key: string, allowed: number[]): number | null {
  const v = Number(params.get(key));
  return allowed.includes(v) ? v : null;
}

export function toSearchParams(state: LinkState): URLSearchParams {
  const f = state.filters;
  const p = new URLSearchParams();
  const setList = (key: string, values: string[]) => values.length && p.set(key, values.join(','));
  if (state.query.trim()) p.set('q', state.query.trim());
  setList('level', f.bands);
  if (f.entering !== null) p.set('entering', gradeCode(f.entering));
  if (f.through !== null) p.set('through', String(f.through));
  if (f.preK) p.set('prek', '1');
  if (f.subwayWalk !== null) p.set('walk', String(f.subwayWalk));
  setList('lines', f.lines);
  if (f.accessible) p.set('accessible', '1');
  setList('borough', f.boroughs.map(boroughSlug));
  setList('size', f.sizes);
  if (f.maxRatio !== null) p.set('ratio', String(f.maxRatio));
  setList('type', f.types);
  if (f.network !== null) p.set('network', f.network);
  setList('years', f.years);
  setList('authorizer', f.authorizers.map((a) => a.toLowerCase()));
  setList('rating', f.ratings);
  if (state.sort !== DEFAULT_SORT && !HOME_SORTS.includes(state.sort)) p.set('sort', state.sort);
  if (state.school) p.set('school', state.school);
  return p;
}

export function fromSearchParams(params: URLSearchParams, ctx: LinkContext): LinkState {
  const boroughBySlug = new Map(BOROUGHS.map((b) => [boroughSlug(b), b]));
  const network = params.get('network');
  const sort = params.get('sort') as SortKey | null;
  const school = params.get('school');
  const through = Number(params.get('through'));
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    bands: list<Band>(params, 'level', BAND_IDS),
    entering: parseGradeCode(params.get('entering')),
    through: through === 8 || through === 12 ? through : null,
    preK: params.get('prek') === '1',
    subwayWalk: oneOf(params, 'walk', [5, 10, 15]),
    lines: list(params, 'lines', [...ctx.lines]),
    accessible: params.get('accessible') === '1',
    boroughs: list(params, 'borough', [...boroughBySlug.keys()]).map((s) => boroughBySlug.get(s) as Borough),
    sizes: list(params, 'size', SIZES),
    maxRatio: oneOf(params, 'ratio', [10, 12, 15]),
    types: list(params, 'type', TYPES),
    network: network && (network === 'any' || network === 'independent' || ctx.networks.has(network)) ? network : null,
    years: list(params, 'years', YEARS),
    authorizers: list(params, 'authorizer', Object.keys(AUTHORIZERS)).map((a) => AUTHORIZERS[a]),
    ratings: list(params, 'rating', RATINGS),
  };
  return {
    filters,
    query: (params.get('q') ?? '').slice(0, 100),
    school: school && ctx.schoolIds.has(school) ? school : null,
    sort: sort && SORTS.some((s) => s.id === sort) && !HOME_SORTS.includes(sort) ? sort : DEFAULT_SORT,
  };
}

/** The query string for a state, with a leading "?" or empty. */
export function linkSearch(state: LinkState): string {
  const s = toSearchParams(state).toString();
  return s ? `?${s}` : '';
}
