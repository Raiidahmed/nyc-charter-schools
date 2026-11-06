import { useMemo } from 'react';
import {
  COMMUTE_OPTIONS,
  countWith,
  type FilterKey,
  type Filters,
  MILE_OPTIONS,
  milesLabel,
  RATIO_OPTIONS,
  SIZES,
  SUBWAY_WALK_OPTIONS,
  toggle,
  yearsLabel,
} from '../lib/filters.ts';
import { ALL_GRADES, BANDS, gradeLongName, gradeRange } from '../lib/grades.ts';
import { AUTHORIZERS, BOROUGHS, MODES, RATINGS, SCHOOL_TYPES } from '../lib/labels.ts';
import { sortLines } from '../lib/subway.ts';
import { useExplorer } from '../state/Explorer.tsx';
import { LineBullet, Option, OptionGroup, Switch } from '../ui/controls.tsx';

function useCount() {
  const { searched, filters, ctx } = useExplorer();
  return <K extends FilterKey>(key: K, value: Filters[K]) => countWith(searched, filters, ctx, key, value);
}

export function GradesFilters() {
  const { filters: f, setFilters } = useExplorer();
  const count = useCount();
  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }));
  return (
    <>
      <OptionGroup label="Grade level">
        {BANDS.map((b) => (
          <Option key={b.id} pressed={f.bands.includes(b.id)} onClick={() => set({ bands: toggle(f.bands, b.id) })} count={count('bands', [b.id])}>
            {b.label} <span className="option-sub">{gradeRange(b.low, b.high)}</span>
          </Option>
        ))}
      </OptionGroup>
      <OptionGroup label="The grade your child is entering">
        <select
          className="select"
          aria-label="The grade your child is entering"
          value={f.entering ?? ''}
          onChange={(e) => set({ entering: e.target.value === '' ? null : Number(e.target.value) })}
        >
          <option value="">Any grade</option>
          {ALL_GRADES.map((g) => (
            <option key={g} value={g}>
              {gradeLongName(g)} ({count('entering', g)})
            </option>
          ))}
        </select>
      </OptionGroup>
      <OptionGroup label="Continues through">
        {([8, 12] as const).map((t) => (
          <Option key={t} pressed={f.through === t} onClick={() => set({ through: f.through === t ? null : t })} count={count('through', t)}>
            {t}th grade
          </Option>
        ))}
      </OptionGroup>
      <OptionGroup label="Early childhood">
        <Option pressed={f.preK} onClick={() => set({ preK: !f.preK })} count={count('preK', true)}>
          Offers Pre-K
        </Option>
      </OptionGroup>
    </>
  );
}

export function LocationFilters() {
  const { filters: f, setFilters, home, travelStatus, trips, remember, setRemember, searched, setSubwayOn } = useExplorer();
  const count = useCount();
  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }));
  const lines = useMemo(() => sortLines(searched.flatMap((s) => s.stations.flatMap((st) => st.lines))), [searched]);
  const commuteReady = !!trips;
  return (
    <>
      {!home ? (
        <p className="filter-note">Set your home in the address box to filter by distance, commute and district.</p>
      ) : (
        <>
          <OptionGroup label="Distance from home" hint="Straight-line distance, drawn as a dashed circle.">
            {MILE_OPTIONS.map((m) => (
              <Option key={m} pressed={f.maxMiles === m} onClick={() => set({ maxMiles: f.maxMiles === m ? null : m })} count={count('maxMiles', m)}>
                Within {milesLabel(m)}
              </Option>
            ))}
          </OptionGroup>
          {travelStatus !== 'missing' && (
            <OptionGroup
              label="Commute"
              hint={
                travelStatus === 'outside'
                  ? 'No commute estimates for this spot.'
                  : !commuteReady
                    ? 'Loading commute estimates…'
                    : f.commuteMode === 'drive'
                      ? 'Estimated driving time at rush hour.'
                      : 'Estimated door to door, leaving 7–8 a.m. on a weekday.'
              }
            >
              <div className="segmented" role="group" aria-label="Travel by">
                {MODES.map((m) => (
                  <button key={m.id} type="button" className="segment" aria-pressed={f.commuteMode === m.id} onClick={() => set({ commuteMode: m.id })}>
                    {m.label}
                  </button>
                ))}
              </div>
              {COMMUTE_OPTIONS.map((m) => (
                <Option
                  key={m}
                  pressed={f.maxCommute === m}
                  disabled={!commuteReady}
                  onClick={() => set({ maxCommute: f.maxCommute === m ? null : m })}
                  count={commuteReady ? count('maxCommute', m) : undefined}
                >
                  {m} min or less
                </Option>
              ))}
            </OptionGroup>
          )}
          <OptionGroup label="District" hint="Charter lotteries favor students who live in the school’s own district.">
            <Option pressed={f.myDistrict} onClick={() => set({ myDistrict: !f.myDistrict })} count={count('myDistrict', true)} disabled={home.district === null}>
              Only schools in my district{home.district !== null ? ` (District ${home.district})` : ''}
            </Option>
          </OptionGroup>
          <Switch checked={remember} onChange={setRemember}>
            Remember my address on this device
          </Switch>
        </>
      )}
      <OptionGroup label="Walk to the subway" hint="Estimated walk to the nearest entrance.">
        {SUBWAY_WALK_OPTIONS.map((m) => (
          <Option key={m} pressed={f.subwayWalk === m} onClick={() => set({ subwayWalk: f.subwayWalk === m ? null : m })} count={count('subwayWalk', m)}>
            {m} min or less
          </Option>
        ))}
      </OptionGroup>
      <OptionGroup label="Subway lines" hint="Schools with a station on any chosen line nearby.">
        <div className="line-grid">
          {lines.map((l) => (
            <button
              key={l}
              type="button"
              className="line-option"
              aria-pressed={f.lines.includes(l)}
              onClick={() => {
                // Picking a line turns the subway layer on.
                if (!f.lines.includes(l)) setSubwayOn(true);
                set({ lines: toggle(f.lines, l) });
              }}
            >
              <LineBullet line={l} />
              <span className="option-count">{count('lines', [l])}</span>
            </button>
          ))}
        </div>
      </OptionGroup>
      <OptionGroup label="Accessibility">
        <Option pressed={f.accessible} onClick={() => set({ accessible: !f.accessible })} count={count('accessible', true)} hint="Fully accessible stations, with elevators or ramps to every platform.">
          Accessible stations only
        </Option>
      </OptionGroup>
      <OptionGroup label="Borough">
        {BOROUGHS.map((b) => (
          <Option key={b} pressed={f.boroughs.includes(b)} onClick={() => set({ boroughs: toggle(f.boroughs, b) })} count={count('boroughs', [b])}>
            {b}
          </Option>
        ))}
      </OptionGroup>
    </>
  );
}

export function ProfileFilters() {
  const { filters: f, setFilters, data, ctx } = useExplorer();
  const count = useCount();
  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }));
  const networks = useMemo(
    () => [...new Set(data.schools.flatMap((s) => (s.network ? [s.network] : [])))].toSorted((a, b) => a.localeCompare(b, 'en')),
    [data.schools],
  );
  return (
    <>
      <OptionGroup label="Size" hint="Enrollment. Schools without a count drop out.">
        {SIZES.map((s) => (
          <Option key={s.id} pressed={f.sizes.includes(s.id)} onClick={() => set({ sizes: toggle(f.sizes, s.id) })} count={count('sizes', [s.id])}>
            {s.label} <span className="option-sub">{s.range}</span>
          </Option>
        ))}
      </OptionGroup>
      <OptionGroup label="Student–teacher ratio">
        {RATIO_OPTIONS.map((r) => (
          <Option key={r} pressed={f.maxRatio === r} onClick={() => set({ maxRatio: f.maxRatio === r ? null : r })} count={count('maxRatio', r)}>
            {r}:1 at most
          </Option>
        ))}
      </OptionGroup>
      <OptionGroup label="School type">
        {SCHOOL_TYPES.map((t) => (
          <Option key={t.id} pressed={f.types.includes(t.id)} onClick={() => set({ types: toggle(f.types, t.id) })} count={count('types', [t.id])} hint={t.about}>
            {t.label}
          </Option>
        ))}
      </OptionGroup>
      <OptionGroup label="Network" hint="Inferred from school names.">
        <select className="select" aria-label="Network" value={f.network ?? ''} onChange={(e) => set({ network: e.target.value || null })}>
          <option value="">All schools</option>
          <option value="any">Any network ({count('network', 'any')})</option>
          <option value="independent">Independent only ({count('network', 'independent')})</option>
          <optgroup label="Networks">
            {networks.map((n) => (
              <option key={n} value={n}>
                {n} ({count('network', n)})
              </option>
            ))}
          </optgroup>
        </select>
      </OptionGroup>
      <OptionGroup label="Years open" hint="Counting school years from July.">
        {(['new', 'established'] as const).map((y) => (
          <Option key={y} pressed={f.years.includes(y)} onClick={() => set({ years: toggle(f.years, y) })} count={count('years', [y])}>
            {yearsLabel(y, ctx.now)}
          </Option>
        ))}
      </OptionGroup>
    </>
  );
}

export function OversightFilters() {
  const { filters: f, setFilters, data } = useExplorer();
  const { summary } = data;
  const count = useCount();
  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }));
  const levels = RATINGS.filter((r) => data.schools.some((s) => s.rating === r.id));
  return (
    <>
      <OptionGroup label="Authorizer" hint="The body that grants the charter and oversees the school.">
        {AUTHORIZERS.map((a) => (
          <Option key={a.id} pressed={f.authorizers.includes(a.id)} onClick={() => set({ authorizers: toggle(f.authorizers, a.id) })} count={count('authorizers', [a.id])} hint={a.about}>
            {a.label}
          </Option>
        ))}
      </OptionGroup>
      <OptionGroup label="State rating" hint={`New York’s ${summary.ratingYear} accountability status, shown as a support level. It isn’t a grade.`}>
        {levels.map((r) => (
          <Option key={r.id} pressed={f.ratings.includes(r.id)} onClick={() => set({ ratings: toggle(f.ratings, r.id) })} count={count('ratings', [r.id])} hint={r.about}>
            {r.label}
          </Option>
        ))}
      </OptionGroup>
    </>
  );
}

export const FILTER_GROUPS = [
  { id: 'grades', label: 'Grades', Component: GradesFilters },
  { id: 'location', label: 'Location', Component: LocationFilters },
  { id: 'profile', label: 'School profile', Component: ProfileFilters },
  { id: 'oversight', label: 'Oversight', Component: OversightFilters },
] as const;
