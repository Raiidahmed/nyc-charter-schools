import type { FilterContext } from './filters.ts';
import { commuteFor } from './travel.ts';
import type { School, TravelMode } from './types.ts';

export type SortKey = 'distance' | 'commute' | 'name' | 'subway' | 'largest' | 'smallest' | 'ratio' | 'newest' | 'oldest';

export const SORTS: { id: SortKey; label: string; needs?: 'home' | 'travel' }[] = [
  { id: 'distance', label: 'Closest first', needs: 'home' },
  { id: 'commute', label: 'Shortest commute', needs: 'travel' },
  { id: 'name', label: 'Name' },
  { id: 'subway', label: 'Closest to the subway' },
  { id: 'largest', label: 'Largest' },
  { id: 'smallest', label: 'Smallest' },
  { id: 'ratio', label: 'Lowest student–teacher ratio' },
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
];

export const DEFAULT_SORT: SortKey = 'name';
export const HOME_SORTS: SortKey[] = ['distance', 'commute'];

/** Sorts that need a home or travel data quietly fall back when those aren't there. */
export function effectiveSort(sort: SortKey, ctx: FilterContext): SortKey {
  if (sort === 'commute' && !ctx.trips) return ctx.home ? 'distance' : DEFAULT_SORT;
  if (sort === 'distance' && !ctx.home) return DEFAULT_SORT;
  return sort;
}

export function availableSorts(ctx: FilterContext) {
  return SORTS.filter((s) => (s.needs === 'home' ? !!ctx.home : s.needs === 'travel' ? !!ctx.trips : true));
}

type Getter = (s: School) => number | null;

function getter(sort: SortKey, ctx: FilterContext, mode: TravelMode): Getter | null {
  switch (sort) {
    case 'distance':
      return (s) => ctx.distances?.get(s.id) ?? null;
    case 'commute':
      return (s) => commuteFor(ctx.trips?.get(s.id), mode);
    case 'subway':
      return (s) => s.stations[0]?.walk ?? null;
    case 'largest':
      return (s) => (s.enrollment === null ? null : -s.enrollment);
    case 'smallest':
      return (s) => s.enrollment;
    case 'ratio':
      return (s) => s.ratio;
    case 'newest':
      return (s) => -s.opened;
    case 'oldest':
      return (s) => s.opened;
    default:
      return null;
  }
}

const byName = (a: School, b: School) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });

/** Sorts a copy. Schools missing a value always sort last. */
export function sortSchools(schools: School[], sort: SortKey, ctx: FilterContext, mode: TravelMode = 'transit'): School[] {
  const get = getter(effectiveSort(sort, ctx), ctx, mode);
  if (!get) return schools.toSorted(byName);
  const value = new Map(schools.map((s) => [s.id, get(s)]));
  return schools.toSorted((a, b) => {
    const va = value.get(a.id) ?? null;
    const vb = value.get(b.id) ?? null;
    if (va === null && vb === null) return byName(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return va - vb || byName(a, b);
  });
}
