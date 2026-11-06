import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  chipsFor,
  clearAll,
  countWith,
  DEFAULT_FILTERS,
  distancesFrom,
  establishedBy,
  type FilterContext,
  type Filters,
  type HomePlace,
  isActive,
  newSince,
  schoolYearStart,
  sizeOf,
} from './filters.ts';
import { NOW, school } from './fixtures.test-utils.ts';
import type { Trips } from './travel.ts';

const HOME: HomePlace = { lat: 40.81, lon: -73.91, label: '1 Home St', district: 7, source: 'address' };
const noHome: FilterContext = { home: null, distances: null, trips: null, now: NOW };

const schools = [
  school({ id: 'a', name: 'Alpha', gradeLow: -1, gradeHigh: 5, enrollment: 250, ratio: 9, district: 7, lat: 40.81, lon: -73.91 }),
  school({ id: 'b', name: 'Bravo', gradeLow: 6, gradeHigh: 8, enrollment: 650, ratio: 14, network: 'KIPP', district: 9, lat: 40.84, lon: -73.91, opened: 2025 }),
  school({ id: 'c', name: 'Charlie', gradeLow: 9, gradeHigh: 12, enrollment: 1200, ratio: null, type: 'transfer', rating: 'csi', borough: 'Brooklyn', district: 16, lat: 40.68, lon: -73.93, opened: 2001 }),
  school({ id: 'd', name: 'Delta', gradeLow: 0, gradeHigh: 8, enrollment: null, ratio: 11, authorizer: 'NYCPS', borough: 'Manhattan', district: 4, lat: 40.79, lon: -73.94,
    stations: [{ id: 's1', name: '116 St', lines: ['6'], access: 'full', walk: 4, lat: 40.79, lon: -73.94 }, { id: 's2', name: '125 St', lines: ['4', '5', '6'], access: 'none', walk: 12, lat: 40.8, lon: -73.94 }] }),
];

const withHome = (trips: Trips | null = null): FilterContext => ({ home: HOME, distances: distancesFrom(HOME, schools), trips, now: NOW });
const run = (patch: Partial<Filters>, ctx = noHome) => applyFilters(schools, { ...DEFAULT_FILTERS, ...patch }, ctx).map((s) => s.id);

describe('grade filters', () => {
  it('matches every band a school touches, widening within the filter', () => {
    expect(run({ bands: ['middle'] })).toEqual(['b', 'd']);
    expect(run({ bands: ['elementary', 'high'] })).toEqual(['a', 'c', 'd']);
  });
  it('matches the grade a child is entering', () => {
    expect(run({ entering: -1 })).toEqual(['a']);
    expect(run({ entering: 7 })).toEqual(['b', 'd']);
  });
  it('matches schools that continue through 8th or 12th grade', () => {
    expect(run({ through: 8 })).toEqual(['b', 'd']);
    expect(run({ through: 12 })).toEqual(['c']);
  });
  it('matches schools offering Pre-K', () => expect(run({ preK: true })).toEqual(['a']));
  it('narrows across different filters', () => expect(run({ bands: ['middle'], entering: 0 })).toEqual(['d']));
});

describe('home-based filters', () => {
  it('do nothing without a home', () => {
    const f = { ...DEFAULT_FILTERS, maxMiles: 0.5, myDistrict: true, maxCommute: 15 };
    expect(applyFilters(schools, f, noHome)).toHaveLength(4);
    expect(isActive(f, 'maxMiles', noHome)).toBe(false);
    expect(chipsFor(f, noHome)).toEqual([]);
  });
  it('filter by straight-line distance once there is a home', () => {
    expect(run({ maxMiles: 0.5 }, withHome())).toEqual(['a']);
    expect(run({ maxMiles: 3 }, withHome())).toEqual(['a', 'b', 'd']);
  });
  it('filter to the home district', () => expect(run({ myDistrict: true }, withHome())).toEqual(['a']));
  it('wait for travel data before the commute filter applies', () => {
    expect(run({ maxCommute: 15 }, withHome(null))).toHaveLength(4);
    const trips: Trips = new Map([
      ['a', { transit: 5, walk: 5, drive: 4, driveRush: 6 }],
      ['b', { transit: 20, walk: 50, drive: 9, driveRush: 14 }],
      ['c', { transit: null, walk: null, drive: 30, driveRush: 45 }],
    ]);
    expect(run({ maxCommute: 15 }, withHome(trips))).toEqual(['a']);
    expect(run({ maxCommute: 15, commuteMode: 'drive' }, withHome(trips))).toEqual(['a', 'b']);
    expect(run({ maxCommute: 60, commuteMode: 'walk' }, withHome(trips))).toEqual(['a', 'b']);
  });
});

describe('subway filters', () => {
  it('limits the walk to the nearest station', () => {
    expect(run({ subwayWalk: 5 })).toEqual(['d']);
    expect(run({ subwayWalk: 5, lines: ['4'] })).toEqual([]);
    expect(run({ subwayWalk: 15, lines: ['4'] })).toEqual(['d']);
  });
  it('requires an accessible station on the chosen line', () => {
    expect(run({ accessible: true, lines: ['6'] })).toEqual(['d']);
    expect(run({ accessible: true, lines: ['5'] })).toEqual([]);
  });
});

describe('profile and oversight filters', () => {
  it('sorts schools into sizes and drops unknown enrollment', () => {
    expect(sizeOf(299)).toBe('small');
    expect(sizeOf(300)).toBe('medium');
    expect(sizeOf(999)).toBe('large');
    expect(sizeOf(1000)).toBe('xlarge');
    expect(run({ sizes: ['small', 'xlarge'] })).toEqual(['a', 'c']);
    expect(run({ sizes: ['small', 'medium', 'large', 'xlarge'] })).not.toContain('d');
  });
  it('keeps ratios at or below the limit and drops unknown ratios', () => expect(run({ maxRatio: 12 })).toEqual(['a', 'd']));
  it('filters by type, borough, authorizer and rating', () => {
    expect(run({ types: ['transfer'] })).toEqual(['c']);
    expect(run({ boroughs: ['Manhattan', 'Brooklyn'] })).toEqual(['c', 'd']);
    expect(run({ authorizers: ['NYCPS'] })).toEqual(['d']);
    expect(run({ ratings: ['csi'] })).toEqual(['c']);
  });
  it('filters by network', () => {
    expect(run({ network: 'KIPP' })).toEqual(['b']);
    expect(run({ network: 'any' })).toEqual(['b']);
    expect(run({ network: 'independent' })).toEqual(['a', 'c', 'd']);
  });
  it('counts school years from July', () => {
    expect(schoolYearStart(new Date('2026-06-30T12:00:00'))).toBe(2025);
    expect(schoolYearStart(new Date('2026-07-01T12:00:00'))).toBe(2026);
    expect(newSince(NOW)).toBe(2024);
    expect(establishedBy(NOW)).toBe(2016);
    expect(run({ years: ['new'] })).toEqual(['b']);
    expect(run({ years: ['established'] })).toEqual(['a', 'c', 'd']);
  });
});

describe('counts, chips and clearing', () => {
  it('counts how many schools an option would leave', () => {
    const f = { ...DEFAULT_FILTERS, boroughs: ['Bronx' as const] };
    expect(countWith(schools, f, noHome, 'bands', ['middle'])).toBe(1);
    expect(countWith(schools, f, noHome, 'boroughs', ['Brooklyn'])).toBe(1);
  });
  it('labels every active filter, with rush-hour wording for driving', () => {
    const f: Filters = { ...DEFAULT_FILTERS, bands: ['high'], entering: 0, maxCommute: 30, commuteMode: 'drive', maxMiles: 0.5, myDistrict: true, lines: ['A', 'S'], network: 'independent', ratings: ['csi'], years: ['new'] };
    const labels = chipsFor(f, withHome(new Map())).map((c) => c.label);
    expect(labels).toEqual([
      'High school',
      'Entering kindergarten',
      'Within ½ mi',
      '≤ 30 min by car at rush hour',
      'In my district (District 7)',
      'A train',
      'Shuttle',
      'Independent',
      'New (opened 2024 or later)',
      'Comprehensive support',
    ]);
  });
  it('removes a chip’s value only', () => {
    const f = { ...DEFAULT_FILTERS, boroughs: ['Bronx' as const, 'Queens' as const] };
    const [first] = chipsFor(f, noHome);
    expect(first.without.boroughs).toEqual(['Queens']);
  });
  it('clears everything except the commute mode', () => {
    const f = { ...DEFAULT_FILTERS, bands: ['high' as const], commuteMode: 'walk' as const, maxCommute: 30 };
    expect(clearAll(f)).toEqual({ ...DEFAULT_FILTERS, commuteMode: 'walk' });
  });
});
