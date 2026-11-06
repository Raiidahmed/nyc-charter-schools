// The "Get started" guide: who you are, up to five short questions, and the
// filters each set of answers produces. The guide replaces earlier filters.
import { DEFAULT_FILTERS, type Filters, type Size } from './filters.ts';
import { gradeLongName, type Band } from './grades.ts';
import { BOROUGHS } from './labels.ts';
import type { SortKey } from './sort.ts';
import type { Borough, TravelMode } from './types.ts';

export type Role = 'parent' | 'student' | 'educator' | 'researcher';

export const ROLES: { id: Role; label: string; blurb: string }[] = [
  { id: 'parent', label: 'Parent or guardian', blurb: 'Find a school for my child.' },
  { id: 'student', label: 'Student', blurb: 'Find a school for me.' },
  { id: 'educator', label: 'Educator or job seeker', blurb: 'Find schools to work at.' },
  { id: 'researcher', label: 'Researcher or just exploring', blurb: 'Browse and compare every school.' },
];

export interface Answers {
  grade?: number;
  travelMode?: TravelMode;
  commute?: number;
  priorities?: string[];
  teachGrades?: Band[];
  workNetwork?: 'network' | 'independent' | 'either';
  sizes?: Size[];
  boroughs?: Borough[];
  researchNetwork?: string;
}

export type QuestionId = keyof Answers | 'home';

export interface Option {
  id: string;
  label: string;
  hint?: string;
}

export interface Question {
  id: QuestionId;
  title: string;
  hint?: string;
  kind: 'single' | 'multi' | 'home';
  options: Option[];
  /** Most answers a multiple-choice question accepts. */
  max?: number;
}

const COMMUTE_CHOICES = [15, 30, 45, 60].map((m) => ({ id: String(m), label: `Up to ${m} minutes` }));

/** Networks with the most schools, offered by name to researchers. */
export const FEATURED_NETWORKS = ['Success Academy', 'Achievement First', 'Ascend', 'Uncommon Schools', 'KIPP'];

export function questionsFor(role: Role, answers: Answers, hasHome: boolean): Question[] {
  const home: Question = {
    id: 'home',
    title: 'Where do you live?',
    hint: 'Used for distance, commute and district. It stays in this browser and never goes in a link.',
    kind: 'home',
    options: [],
  };
  if (role === 'parent') {
    const g = answers.grade;
    const priorities: Option[] = [
      { id: 'smaller', label: 'A smaller school', hint: 'Under 600 students' },
      { id: 'subway', label: 'Near the subway', hint: 'A station within a 10-minute walk' },
    ];
    if (g === undefined || g <= 5) priorities.push({ id: 'through8', label: 'Staying in one school through 8th grade' });
    if (g === undefined || (g >= 6 && g <= 11)) priorities.push({ id: 'through12', label: 'Staying through 12th grade' });
    if (hasHome)
      priorities.push({ id: 'district', label: 'Schools in our district', hint: 'Charter lotteries favor students from the school’s own district' });
    return [
      {
        id: 'grade',
        title: 'What grade will your child enter next fall?',
        kind: 'single',
        options: Array.from({ length: 14 }, (_, i) => ({ id: String(i - 1), label: gradeLongName(i - 1) })),
      },
      home,
      ...(hasHome
        ? ([
            {
              id: 'travelMode',
              title: 'How would your child get to school?',
              kind: 'single',
              options: [
                { id: 'transit', label: 'Subway or bus' },
                { id: 'walk', label: 'Walking' },
                { id: 'drive', label: 'By car' },
              ],
            },
            { id: 'commute', title: 'How long a trip is acceptable?', kind: 'single', options: COMMUTE_CHOICES },
          ] satisfies Question[])
        : []),
      { id: 'priorities', title: 'What matters most?', hint: 'Pick up to three.', kind: 'multi', max: 3, options: priorities },
    ];
  }
  if (role === 'student') {
    const priorities: Option[] = [];
    if (hasHome) priorities.push({ id: 'shorter', label: 'A shorter commute' });
    priorities.push(
      { id: 'smaller', label: 'A smaller school', hint: 'Under 600 students' },
      { id: 'subway', label: 'Near the subway', hint: 'A station within a 10-minute walk' },
    );
    if (answers.grade === undefined || answers.grade >= 9)
      priorities.push({ id: 'fresh', label: 'A fresh start or catching up on credits', hint: 'Transfer schools' });
    return [
      {
        id: 'grade',
        title: 'What grade will you be in next fall?',
        kind: 'single',
        options: Array.from({ length: 7 }, (_, i) => ({ id: String(i + 6), label: gradeLongName(i + 6) })),
      },
      home,
      ...(hasHome
        ? ([{ id: 'commute', title: 'How long a subway or bus ride is OK?', kind: 'single', options: COMMUTE_CHOICES }] satisfies Question[])
        : []),
      { id: 'priorities', title: 'What matters most?', hint: 'Pick up to three.', kind: 'multi', max: 3, options: priorities },
    ];
  }
  if (role === 'educator') {
    return [
      {
        id: 'teachGrades',
        title: 'Which grades do you teach?',
        hint: 'Pick any that apply.',
        kind: 'multi',
        options: [
          { id: 'elementary', label: 'Elementary', hint: 'Pre-K to 5th grade' },
          { id: 'middle', label: 'Middle', hint: '6th to 8th grade' },
          { id: 'high', label: 'High school', hint: '9th to 12th grade' },
        ],
      },
      home,
      ...(hasHome
        ? ([{ id: 'commute', title: 'How long a commute is acceptable?', hint: 'By subway or bus.', kind: 'single', options: COMMUTE_CHOICES }] satisfies Question[])
        : []),
      {
        id: 'workNetwork',
        title: 'A network or an independent school?',
        kind: 'single',
        options: [
          { id: 'network', label: 'A school in a network', hint: 'Part of a group such as KIPP or Success Academy' },
          { id: 'independent', label: 'An independent school', hint: 'Runs on its own' },
          { id: 'either', label: 'Either' },
        ],
      },
      {
        id: 'sizes',
        title: 'What size school?',
        hint: 'Pick any that apply.',
        kind: 'multi',
        options: [
          { id: 'small', label: 'Small', hint: 'Under 300 students' },
          { id: 'medium', label: 'Medium', hint: '300–599 students' },
          { id: 'large', label: 'Large', hint: '600–999 students' },
          { id: 'xlarge', label: 'Very large', hint: '1,000 students or more' },
        ],
      },
    ];
  }
  return [
    {
      id: 'boroughs',
      title: 'Which boroughs do you want to focus on?',
      hint: 'Pick any, or skip for the whole city.',
      kind: 'multi',
      options: BOROUGHS.map((b) => ({ id: b, label: b })),
    },
    {
      id: 'researchNetwork',
      title: 'Do you want to focus on a network?',
      hint: 'Every network can also be chosen later under School profile.',
      kind: 'single',
      options: [
        { id: 'all', label: 'No, show every school' },
        { id: 'any', label: 'Schools in any network' },
        { id: 'independent', label: 'Independent schools only' },
        ...FEATURED_NETWORKS.map((n) => ({ id: n, label: n })),
      ],
    },
  ];
}

/** Turns answers into filters and a sort. Earlier filters are replaced. */
export function guideResult(role: Role, answers: Answers, hasHome: boolean, commuteMode: TravelMode): { filters: Filters; sort: SortKey } {
  const f: Filters = { ...DEFAULT_FILTERS, commuteMode };
  const picked = new Set(answers.priorities ?? []);
  let sort: SortKey = 'name';

  if (role === 'parent' || role === 'student') {
    if (answers.grade !== undefined) f.entering = answers.grade;
    if (hasHome && answers.commute !== undefined) {
      f.maxCommute = answers.commute;
      f.commuteMode = role === 'student' ? 'transit' : (answers.travelMode ?? 'transit');
    } else if (hasHome && role === 'parent' && answers.travelMode) {
      f.commuteMode = answers.travelMode;
    }
    if (picked.has('smaller')) f.sizes = ['small', 'medium'];
    if (picked.has('subway')) f.subwayWalk = 10;
    if (picked.has('through8')) f.through = 8;
    if (picked.has('through12')) f.through = 12;
    if (picked.has('district') && hasHome) f.myDistrict = true;
    if (picked.has('fresh')) f.types = ['transfer'];
    if (hasHome) sort = f.maxCommute !== null || picked.has('shorter') ? 'commute' : 'distance';
    if (picked.has('shorter') && hasHome) f.commuteMode = 'transit';
  } else if (role === 'educator') {
    if (answers.teachGrades?.length) f.bands = answers.teachGrades;
    if (hasHome && answers.commute !== undefined) {
      f.maxCommute = answers.commute;
      f.commuteMode = 'transit';
    }
    if (answers.workNetwork === 'network') f.network = 'any';
    if (answers.workNetwork === 'independent') f.network = 'independent';
    if (answers.sizes?.length) f.sizes = answers.sizes;
    if (hasHome) sort = f.maxCommute !== null ? 'commute' : 'distance';
  } else {
    if (answers.boroughs?.length) f.boroughs = answers.boroughs;
    if (answers.researchNetwork && answers.researchNetwork !== 'all') f.network = answers.researchNetwork;
  }
  return { filters: f, sort };
}

/** When the admissions details below were last checked. Check them each fall. */
export const ADMISSIONS_CHECKED = 'November 5, 2026';

export const ADMISSIONS_LINKS = {
  guide: 'https://www.schools.nyc.gov/enrollment/enroll-in-charter-schools/how-to-enroll-in-charter-schools',
  commonApp: 'https://nyccharterschools.org/apply-to-a-charter-school/',
};
