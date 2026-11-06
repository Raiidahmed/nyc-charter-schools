import type { Authorizer, Borough, Rating, SchoolType, TravelMode } from './types.ts';

export const BOROUGHS: Borough[] = ['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island'];

export const AUTHORIZERS: { id: Authorizer; label: string; short: string; about: string }[] = [
  {
    id: 'SUNY',
    label: 'SUNY Charter Schools Institute',
    short: 'SUNY',
    about: 'The State University of New York’s Charter Schools Institute grants and renews this school’s charter and checks that it meets its goals.',
  },
  {
    id: 'NYCPS',
    label: 'NYC Public Schools',
    short: 'NYC Public Schools',
    about: 'The city’s Department of Education (NYC Public Schools) grants and renews this school’s charter and checks that it meets its goals.',
  },
  {
    id: 'Regents',
    label: 'NYS Board of Regents',
    short: 'Board of Regents',
    about: 'The New York State Board of Regents, through the State Education Department, grants and renews this school’s charter and checks that it meets its goals.',
  },
];

export function authorizerInfo(id: Authorizer) {
  return AUTHORIZERS.find((a) => a.id === id) ?? AUTHORIZERS[0];
}

export const SCHOOL_TYPES: { id: SchoolType; label: string; plural: string; about: string }[] = [
  { id: 'general', label: 'General', plural: 'General schools', about: 'A general-education school.' },
  {
    id: 'special',
    label: 'Special education',
    plural: 'Special education schools',
    about: 'A school designed for students with disabilities.',
  },
  {
    id: 'transfer',
    label: 'Transfer school',
    plural: 'Transfer schools',
    about: 'A second-chance high school for students who are older or behind on credits.',
  },
];

export function typeLabel(t: SchoolType): string {
  return SCHOOL_TYPES.find((x) => x.id === t)?.label ?? t;
}

export const RATINGS: { id: Rating; label: string; state: string; about: string }[] = [
  {
    id: 'local',
    label: 'Local support',
    state: 'Local Support and Improvement',
    about: 'The default level. The school isn’t identified for extra state support; it plans its own improvements with its authorizer.',
  },
  {
    id: 'tsi',
    label: 'Targeted support',
    state: 'Targeted Support and Improvement',
    about: 'The state has identified one or more groups of students at this school for extra support.',
  },
  {
    id: 'atsi',
    label: 'Additional targeted support',
    state: 'Additional Targeted Support and Improvement',
    about: 'The state has identified one or more groups of students at this school for additional support.',
  },
  {
    id: 'csi',
    label: 'Comprehensive support',
    state: 'Comprehensive Support and Improvement',
    about: 'The state has identified the school as a whole for its most intensive level of support, based on its overall results.',
  },
];

export function ratingInfo(r: Rating) {
  return RATINGS.find((x) => x.id === r) ?? RATINGS[0];
}

const schoolYear = (start: number) => `${start}–${String(start + 1).slice(2)}`;

/** Status published in a given year comes from the previous year's results and applies to the following school year. */
export function ratingBasis(year: number): string {
  return `This is New York’s ${year} accountability status, based on ${schoolYear(year - 1)} results and applying to the ${schoolYear(year)} school year.`;
}

export const TRANSFER_RATING_NOTE =
  'Transfer schools serve students who are older or behind on credits, so measures such as four-year graduation rates often place them at this level.';

export const MODES: { id: TravelMode; label: string; by: string; google: string }[] = [
  { id: 'transit', label: 'Transit', by: 'by transit', google: 'transit' },
  { id: 'walk', label: 'On foot', by: 'on foot', google: 'walking' },
  { id: 'drive', label: 'By car', by: 'by car', google: 'driving' },
];

export function modeInfo(m: TravelMode) {
  return MODES.find((x) => x.id === m) ?? MODES[0];
}

export function boroughSlug(b: Borough): string {
  return b.toLowerCase().replace(/\s+/g, '-');
}
