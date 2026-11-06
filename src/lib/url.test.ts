import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, type Filters } from './filters.ts';
import { fromSearchParams, linkSearch, type LinkState, toSearchParams } from './url.ts';

const ctx = { schoolIds: new Set(['320700860957']), networks: new Set(['KIPP', 'Success Academy']), lines: new Set(['A', 'C', '6', 'SIR']) };
const read = (qs: string) => fromSearchParams(new URLSearchParams(qs), ctx);
const base: LinkState = { filters: DEFAULT_FILTERS, query: '', school: null, sort: 'name' };

describe('shareable links', () => {
  it('leaves defaults out', () => expect(linkSearch(base)).toBe(''));

  it('round-trips every filter that does not need a home', () => {
    const filters: Filters = {
      ...DEFAULT_FILTERS,
      bands: ['elementary', 'high'],
      entering: -1,
      through: 12,
      preK: true,
      subwayWalk: 10,
      lines: ['A', 'SIR'],
      accessible: true,
      boroughs: ['Staten Island', 'Bronx'],
      sizes: ['small', 'xlarge'],
      maxRatio: 12,
      types: ['transfer'],
      network: 'Success Academy',
      years: ['established'],
      authorizers: ['NYCPS', 'Regents'],
      ratings: ['csi', 'tsi'],
    };
    const state: LinkState = { filters, query: 'kipp bronx', school: '320700860957', sort: 'ratio' };
    expect(read(toSearchParams(state).toString())).toEqual(state);
    for (const entering of [0, 6, 12]) {
      const s = { ...base, filters: { ...DEFAULT_FILTERS, entering } };
      expect(read(toSearchParams(s).toString()).filters.entering).toBe(entering);
    }
    for (const network of ['any', 'independent']) {
      const s = { ...base, filters: { ...DEFAULT_FILTERS, network } };
      expect(read(toSearchParams(s).toString()).filters.network).toBe(network);
    }
  });

  it('never writes the home or the filters and sorts that depend on it', () => {
    const state: LinkState = {
      ...base,
      filters: { ...DEFAULT_FILTERS, maxMiles: 1, maxCommute: 30, commuteMode: 'drive', myDistrict: true },
      sort: 'distance',
    };
    expect(linkSearch(state)).toBe('');
    expect(linkSearch({ ...state, sort: 'commute' })).toBe('');
  });

  it('ignores unknown values', () => {
    const s = read('level=elementary,college&borough=atlantis&lines=Q9,A&network=Nowhere&school=999&sort=random&walk=7&ratio=3&entering=14&through=9&rating=gold');
    expect(s.filters).toEqual({ ...DEFAULT_FILTERS, bands: ['elementary'], lines: ['A'] });
    expect(s.school).toBeNull();
    expect(s.sort).toBe('name');
  });

  it('ignores home values in a link, even if someone adds them', () => {
    const s = read('home=40.8,-73.9&address=1+Main+St&sort=distance');
    expect(s).toEqual(base);
  });

  it('cleans up links from earlier versions', () => {
    const s = read('layout=table&view=list&panel=open&zoom=12&center=40.7,-74&q=icahn');
    expect(s).toEqual({ ...base, query: 'icahn' });
    expect(linkSearch(s)).toBe('?q=icahn');
  });
});
