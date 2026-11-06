// The data notes. Real counts, years and factors come from the data and code.
import { RATIO_RANGE, MAX_STATIONS, STATION_RADIUS_MILES } from '../lib/constants.ts';
import { SIZES } from '../lib/filters.ts';
import { formatMinutes, formatNumber, plural } from '../lib/format.ts';
import { WALK_DETOUR, WALK_MPH } from '../lib/geo.ts';
import { ratingBasis } from '../lib/labels.ts';
import { RUSH_FACTOR, ZONE_RUSH_FACTOR } from '../lib/travel.ts';
import type { Summary, TravelIndex } from '../lib/types.ts';
import { useExplorer } from '../state/Explorer.tsx';

const pct = (f: number) => `${Math.round((f - 1) * 100)}%`;

function directoryDate(summary: Summary) {
  return summary.sources.find((s) => s.key === 'directory')?.edition.replace(/^As of /, '') ?? '';
}

export function Sources() {
  const { summary } = useExplorer().data;
  return (
    <ul className="sources">
      {summary.sources.map((s) => (
        <li key={s.key}>
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.name}
          </a>
          , {s.publisher}. {s.edition}.
        </li>
      ))}
      <li>Map tiles © OpenStreetMap contributors, via OpenFreeMap.</li>
    </ul>
  );
}

export function NotPlaced() {
  const { summary } = useExplorer().data;
  return (
    <ul className="not-placed">
      {summary.missing.map((m) => (
        <li key={m.id}>
          <span>{m.name}</span>
          <span className="muted">
            {m.reason === 'new' ? 'New school' : 'No location record'} · opened {m.opened}
            {m.borough ? ` · ${m.borough}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function whichSchools(summary: Summary): string {
  const newCount = summary.missing.filter((m) => m.reason === 'new').length;
  const noLocation = summary.missing.length - newCount;
  return (
    `Every New York City charter school on the state’s directory (as of ${directoryDate(summary)}) that has a federal location record: ${plural(summary.counts.placed, 'school')}. ` +
    `${plural(summary.counts.notPlaced, 'more school')} ${summary.counts.notPlaced === 1 ? 'is' : 'are'} listed under “Not on the map yet”: ${formatNumber(newCount)} new ${newCount === 1 ? 'school' : 'schools'} and ${formatNumber(noLocation)} with no location record. ` +
    `${plural(summary.counts.setAside, 'federal record')} that matched no current charter (probably closed or merged) ${summary.counts.setAside === 1 ? 'is' : 'are'} left out.`
  );
}

export function schoolFacts(summary: Summary): string {
  const sizes = SIZES.map((s) => `${s.label.toLowerCase()} ${s.range}`).join(', ');
  return (
    `Addresses, grades, enrollment, student–teacher ratios and school types come from the federal ${summary.enrollmentYear} school year data, so they can trail the state’s list by a year or more. ` +
    `Ratios outside ${RATIO_RANGE[0]}:1 to ${RATIO_RANGE[1]}:1 are treated as unreported because they’re almost certainly reporting errors. ` +
    `The size cutoffs (${sizes}) and the networks, matched from school names, are our own judgment.`
  );
}

export const HOME_NOTE =
  'Distances are straight lines, not routes. Your district is the community school district whose outline contains your home, and a school’s district is the one whose outline contains the school, falling back to the state’s listing. Addresses you type go to NYC Planning’s address search to find a location; they never go into a link you share, and neither do the distance, commute and district filters.';

export function commuteNote(index: TravelIndex | null): string {
  if (!index) return 'Commute estimates aren’t built yet, so commute options are hidden.';
  const day = new Date(`${index.departure}:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const squares = index.cells ? `${formatNumber(index.cells)} squares` : 'squares';
  return (
    `Commutes are estimated ahead of time, never by a routing service while you use the site. R5, Conveyal’s routing engine (through r5py), worked out the trip from each of ${squares} about 300 meters across to every school, using OpenStreetMap streets, the MTA’s subway and bus timetables, and the Staten Island Ferry. ` +
    `Transit is the median trip for departures between 7 and 8 a.m. on ${day}, walking at ${WALK_MPH} mph. NYC Ferry, commuter rail and school buses aren’t included. Your home uses the estimate for the square it falls in.`
  );
}

export function rushNote(index: TravelIndex | null): string {
  const cell = index ? `${index.driveCell * 300} meter` : 'larger';
  return `Driving is computed with no traffic on ${cell} squares, then turned into a rush-hour time in your browser: times ${RUSH_FACTOR}, or times ${ZONE_RUSH_FACTOR} when the home or the school is in Manhattan’s congestion zone (roughly south of 60th Street). The factors are rough, based on MTA bus speeds and taxi speeds by hour. Filters and sorting use the rush-hour time.`;
}

export function cutoffNote(index: TravelIndex | null): string {
  const c = index?.cutoffs ?? { transit: 120, walk: 90, drive: 90 };
  return `Trips longer than ${formatMinutes(c.transit)} by transit, ${formatMinutes(c.walk)} on foot or ${formatMinutes(c.drive)} by car count as unreachable.`;
}

export const SUBWAY_NOTE = `Walks to the subway are the straight-line distance to the nearest entrance, plus ${pct(WALK_DETOUR)} for real streets, at ${WALK_MPH} mph. Each school lists up to ${MAX_STATIONS} stations within ${STATION_RADIUS_MILES === 0.75 ? 'three quarters of a mile' : `${STATION_RADIUS_MILES} miles`}, nearest first, with their accessibility from the MTA.`;

export function ratingNote(summary: Summary): string {
  return `${ratingBasis(summary.ratingYear)} It’s a support level, not a grade: most schools are at the default level, Local support, and the other levels mean the state has identified the school, or some of its students, for extra support. Transfer schools often land at Comprehensive support because they serve students who are behind on credits. It isn’t a ranking and says nothing on its own about whether a school suits a particular student.`;
}

export const LEFT_OUT_NOTE =
  'Test scores, demographics, rankings and specialty programs are left out on purpose. The map describes schools; it never ranks them.';

export const PLACEMENT_NOTE =
  'Each school is shown at one address, from its federal record, even if it uses more than one building. Networks are inferred from school names with a short hand-written list; schools that don’t match count as independent.';
