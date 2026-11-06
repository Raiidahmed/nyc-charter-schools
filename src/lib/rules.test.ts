import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, distancesFrom, type FilterContext, type HomePlace } from './filters.ts';
import { NOW, school } from './fixtures.test-utils.ts';
import { districtAt, inCongestionZone, milesBetween, walkMinutes, type DistrictFeature } from './geo.ts';
import { bandsFor, gradeRange, parseGrade } from './grades.ts';
import { listHeading } from './listHeading.ts';
import { matchesSearch, normalize } from './search.ts';
import { effectiveSort, sortSchools } from './sort.ts';
import { cellFor, commuteFor, readTrips, rushHour } from './travel.ts';
import type { TravelIndex } from './types.ts';

describe('grades', () => {
  it('parses federal grade codes', () => {
    expect(parseGrade('PK')).toBe(-1);
    expect(parseGrade('KG')).toBe(0);
    expect(parseGrade('08')).toBe(8);
    expect(parseGrade('13')).toBeNull();
    expect(parseGrade('UG')).toBeNull();
  });
  it('puts a school in every band its grades touch', () => {
    expect(bandsFor(-1, 5)).toEqual(['elementary']);
    expect(bandsFor(5, 6)).toEqual(['elementary', 'middle']);
    expect(bandsFor(0, 12)).toEqual(['elementary', 'middle', 'high']);
    expect(bandsFor(9, 12)).toEqual(['high']);
  });
  it('formats ranges', () => {
    expect(gradeRange(-1, 8)).toBe('Pre-K–8');
    expect(gradeRange(0, 0)).toBe('K');
  });
});

const square = (d: number, x: number): DistrictFeature => ({
  type: 'Feature',
  properties: { district: d },
  geometry: { type: 'MultiPolygon', coordinates: [[[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]]] },
});

describe('distances', () => {
  it('measures straight lines in miles', () => {
    // Times Square to the Empire State Building is about 0.6 miles.
    expect(milesBetween(40.758, -73.9855, 40.7484, -73.9857)).toBeCloseTo(0.66, 1);
  });
  it('adds 30% for streets and walks at 3 mph', () => {
    expect(walkMinutes(0.5)).toBe(13);
    expect(walkMinutes(0.01)).toBe(1);
  });
  it('finds the district whose outline contains a point', () => {
    expect(districtAt(0.5, 1.5, [square(1, 0), square(2, 1)])).toBe(2);
    expect(districtAt(5, 5, [square(1, 0)])).toBeNull();
  });
  it('knows Manhattan’s congestion zone, roughly south of 60th Street', () => {
    expect(inCongestionZone(40.758, -73.9855, 2)).toBe(true); // Times Square
    expect(inCongestionZone(40.7812, -73.9665, 3)).toBe(false); // Central Park at 79th
    expect(inCongestionZone(40.758, -73.9855, 15)).toBe(false); // not Manhattan
  });
});

describe('search', () => {
  const s = school({ id: 'x', name: 'Bronx Global Learning Institute, the Shirley Rodríguez-Remeneski School', network: 'Success Academy', address: '977 Fox St' });
  it('ignores accents, case and punctuation', () => {
    expect(normalize('Rodríguez’s  SCHOOL')).toBe('rodriguezs school');
    expect(matchesSearch(s, 'rodriguez')).toBe(true);
    expect(matchesSearch(s, 'RODRÍGUEZ')).toBe(true);
  });
  it('matches every word against names, networks and addresses', () => {
    expect(matchesSearch(s, 'success fox')).toBe(true);
    expect(matchesSearch(s, 'succ')).toBe(true);
    expect(matchesSearch(s, 'ccess')).toBe(false);
    expect(matchesSearch(s, '7')).toBe(false);
    expect(matchesSearch(s, 'success kipp')).toBe(false);
    expect(matchesSearch(s, '   ')).toBe(true);
  });
});

describe('sorting', () => {
  const home: HomePlace = { lat: 40.8, lon: -73.9, label: 'Home', district: 7, source: 'pin' };
  const list = [
    school({ id: 'a', name: 'Alpha', enrollment: 300, ratio: 15, opened: 2005, lat: 40.9, stations: [] }),
    school({ id: 'b', name: 'Bravo', enrollment: null, ratio: 9, opened: 2020, lat: 40.81, stations: [{ id: '1', name: 'X', lines: ['1'], access: 'none', walk: 3, lat: 0, lon: 0 }] }),
    school({ id: 'c', name: 'charlie', enrollment: 900, ratio: null, opened: 2012, lat: 40.85, stations: [{ id: '2', name: 'Y', lines: ['1'], access: 'none', walk: 8, lat: 0, lon: 0 }] }),
  ];
  const ctx: FilterContext = { home: null, distances: null, trips: null, now: NOW };
  const homeCtx: FilterContext = { ...ctx, home, distances: distancesFrom(home, list) };
  const ids = (sort: Parameters<typeof sortSchools>[1], c = ctx) => sortSchools(list, sort, c).map((s) => s.id);
  it('sorts by every option, with missing values last', () => {
    expect(ids('name')).toEqual(['a', 'b', 'c']);
    expect(ids('subway')).toEqual(['b', 'c', 'a']);
    expect(ids('largest')).toEqual(['c', 'a', 'b']);
    expect(ids('smallest')).toEqual(['a', 'c', 'b']);
    expect(ids('ratio')).toEqual(['b', 'a', 'c']);
    expect(ids('newest')).toEqual(['b', 'c', 'a']);
    expect(ids('oldest')).toEqual(['a', 'c', 'b']);
    expect(ids('distance', homeCtx)).toEqual(['b', 'c', 'a']);
  });
  it('sorts by commute, with unreachable schools last', () => {
    const trips = new Map([
      ['a', { transit: 20, walk: null, drive: 10, driveRush: 15 }],
      ['b', { transit: null, walk: null, drive: 5, driveRush: 8 }],
      ['c', { transit: 12, walk: 40, drive: 12, driveRush: 18 }],
    ]);
    const c = { ...homeCtx, trips };
    expect(sortSchools(list, 'commute', c, 'transit').map((s) => s.id)).toEqual(['c', 'a', 'b']);
    expect(sortSchools(list, 'commute', c, 'drive').map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });
  it('falls back quietly without a home or travel data', () => {
    expect(effectiveSort('distance', ctx)).toBe('name');
    expect(effectiveSort('commute', ctx)).toBe('name');
    expect(effectiveSort('commute', homeCtx)).toBe('distance');
    expect(ids('distance')).toEqual(['a', 'b', 'c']);
  });
});

describe('travel grid and rush hour', () => {
  const index: TravelIndex = {
    version: 1, built: '', lat0: 40, lon0: -74, dlat: 0.01, dlon: 0.01, rows: 12, cols: 12, block: 6,
    modes: ['transit', 'walk', 'drive'], schools: ['a', 'b'], blocks: ['0-0', '1-1'], cells: 2, unreachable: 255,
    departure: '', windowMinutes: 60, cutoffs: { transit: 120, walk: 90, drive: 90 }, driveCell: 2, feeds: [],
  };
  it('finds a home’s square and block', () => {
    expect(cellFor(index, 40.015, -73.985)).toEqual({ row: 1, col: 1, block: '0-0', slot: 7 });
    expect(cellFor(index, 40.075, -73.925)).toEqual({ row: 7, col: 7, block: '1-1', slot: 7 });
    expect(cellFor(index, 40.015, -73.925)).toBeNull(); // block 0-1 has no land
    expect(cellFor(index, 39, -74)).toBeNull();
  });
  it('reads one byte per minute and treats 255 as unreachable', () => {
    const bytes = new Uint8Array(3 * 36 * 2).fill(255);
    const slot = 7;
    const perMode = 36 * 2;
    bytes[slot * 2] = 25; // transit to a
    bytes[perMode + slot * 2] = 60; // walk to a
    bytes[2 * perMode + slot * 2] = 10; // drive to a
    const schools = [school({ id: 'a', lat: 40.85, lon: -73.9, district: 9 }), school({ id: 'b' }), school({ id: 'z' })];
    const trips = readTrips(index, bytes, slot, { lat: 40.85, lon: -73.9, district: 9 }, schools);
    expect(trips.get('a')).toEqual({ transit: 25, walk: 60, drive: 10, driveRush: 15 });
    expect(trips.get('b')).toEqual({ transit: null, walk: null, drive: null, driveRush: null });
    bytes[slot * 2 + 1] = 0;
    expect(readTrips(index, bytes, slot, { lat: 40.85, lon: -73.9, district: 9 }, schools).get('b')?.transit).toBe(1);
    expect(trips.has('z')).toBe(false);
    expect(commuteFor(trips.get('a'), 'drive')).toBe(15);
    expect(commuteFor(trips.get('a'), 'walk')).toBe(60);
  });
  it('applies the rush-hour rule', () => {
    expect(rushHour(8, false, false)).toBe(12);
    expect(rushHour(8, true, false)).toBe(16);
    expect(rushHour(8, false, true)).toBe(16);
  });
});

describe('list heading', () => {
  it('has three forms', () => {
    expect(listHeading({ total: 280, inView: 280, query: '' })).toBe('280 schools');
    expect(listHeading({ total: 280, inView: 12, query: '' })).toBe('12 of 280 schools in view');
    expect(listHeading({ total: 9, inView: 2, query: 'kipp' })).toBe('9 schools match “kipp”');
  });
  it('handles one and none', () => {
    expect(listHeading({ total: 1, inView: 1, query: '' })).toBe('1 school');
    expect(listHeading({ total: 1, inView: 0, query: 'icahn 7' })).toBe('1 school matches “icahn 7”');
    expect(listHeading({ total: 0, inView: 0, query: 'zzz' })).toBe('No schools match “zzz”');
  });
});

it('default filters are all off', () => {
  expect(Object.values(DEFAULT_FILTERS).filter((v) => (Array.isArray(v) ? v.length : v !== null && v !== false && v !== 'transit'))).toEqual([]);
});
