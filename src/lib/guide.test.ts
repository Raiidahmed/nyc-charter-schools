import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from './filters.ts';
import { guideResult, questionsFor } from './guide.ts';

const ids = (qs: { id: string }[]) => qs.map((q) => q.id);
const options = (grade: number | undefined, home: boolean) =>
  questionsFor('parent', { grade }, home).find((q) => q.id === 'priorities')!.options.map((o) => o.id);

describe('guide questions', () => {
  it('asks parents up to five questions, adding travel ones when they give an address', () => {
    expect(ids(questionsFor('parent', {}, false))).toEqual(['grade', 'home', 'priorities']);
    expect(ids(questionsFor('parent', {}, true))).toEqual(['grade', 'home', 'travelMode', 'commute', 'priorities']);
  });
  it('offers each priority only where it makes sense', () => {
    expect(options(5, false)).toEqual(['smaller', 'subway', 'through8']);
    expect(options(6, true)).toEqual(['smaller', 'subway', 'through12', 'district']);
    expect(options(12, false)).toEqual(['smaller', 'subway']);
  });
  it('asks students grades 6–12 and offers transfer schools to high schoolers', () => {
    const qs = questionsFor('student', { grade: 9 }, true);
    expect(ids(qs)).toEqual(['grade', 'home', 'commute', 'priorities']);
    expect(qs[0].options.map((o) => o.id)).toEqual(['6', '7', '8', '9', '10', '11', '12']);
    expect(qs[3].options.map((o) => o.id)).toEqual(['shorter', 'smaller', 'subway', 'fresh']);
    expect(questionsFor('student', { grade: 7 }, false)[2].options.map((o) => o.id)).toEqual(['smaller', 'subway']);
  });
  it('asks educators and researchers their own questions', () => {
    expect(ids(questionsFor('educator', {}, true))).toEqual(['teachGrades', 'home', 'commute', 'workNetwork', 'sizes']);
    expect(ids(questionsFor('researcher', {}, false))).toEqual(['boroughs', 'researchNetwork']);
  });
});

describe('guide answers to filters', () => {
  it('builds a parent’s filters and picks the commute sort', () => {
    const r = guideResult('parent', { grade: 0, travelMode: 'walk', commute: 30, priorities: ['smaller', 'subway', 'through8', 'district'] }, true, 'transit');
    expect(r.filters).toEqual({ ...DEFAULT_FILTERS, entering: 0, commuteMode: 'walk', maxCommute: 30, sizes: ['small', 'medium'], subwayWalk: 10, through: 8, myDistrict: true });
    expect(r.sort).toBe('commute');
  });
  it('picks closest first with a home but no commute limit, and name without a home', () => {
    expect(guideResult('parent', { grade: 3 }, true, 'transit').sort).toBe('distance');
    expect(guideResult('parent', { grade: 3, priorities: ['district'] }, false, 'transit')).toEqual({ filters: { ...DEFAULT_FILTERS, entering: 3 }, sort: 'name' });
  });
  it('builds a student’s filters', () => {
    const r = guideResult('student', { grade: 10, commute: 45, priorities: ['fresh', 'shorter'] }, true, 'drive');
    expect(r.filters).toEqual({ ...DEFAULT_FILTERS, entering: 10, maxCommute: 45, commuteMode: 'transit', types: ['transfer'] });
    expect(r.sort).toBe('commute');
  });
  it('builds an educator’s filters', () => {
    const r = guideResult('educator', { teachGrades: ['middle', 'high'], workNetwork: 'independent', sizes: ['large'] }, false, 'transit');
    expect(r.filters).toEqual({ ...DEFAULT_FILTERS, bands: ['middle', 'high'], network: 'independent', sizes: ['large'] });
    expect(guideResult('educator', { workNetwork: 'network' }, false, 'transit').filters.network).toBe('any');
    expect(guideResult('educator', { workNetwork: 'either' }, false, 'transit').filters.network).toBeNull();
  });
  it('builds a researcher’s filters', () => {
    expect(guideResult('researcher', { boroughs: ['Queens'], researchNetwork: 'KIPP' }, false, 'transit')).toEqual({
      filters: { ...DEFAULT_FILTERS, boroughs: ['Queens'], network: 'KIPP' },
      sort: 'name',
    });
    expect(guideResult('researcher', { researchNetwork: 'all' }, false, 'transit').filters).toEqual(DEFAULT_FILTERS);
  });
  it('keeps the commute mode when skipped', () => {
    expect(guideResult('researcher', {}, false, 'walk').filters.commuteMode).toBe('walk');
  });
});
