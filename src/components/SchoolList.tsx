import { useLayoutEffect, useRef } from 'react';
import { formatMiles, formatMinutes } from '../lib/format.ts';
import { gradeRange } from '../lib/grades.ts';
import { modeInfo } from '../lib/labels.ts';
import { listHeading } from '../lib/listHeading.ts';
import { availableSorts, effectiveSort, type SortKey } from '../lib/sort.ts';
import { commuteFor } from '../lib/travel.ts';
import type { School } from '../lib/types.ts';
import { useExplorer } from '../state/Explorer.tsx';
import { LineBullet } from '../ui/controls.tsx';
import { CloseIcon } from '../ui/icons.tsx';
import { AboutData } from './AboutData.tsx';

function SchoolRow({ school, recent }: { school: School; recent: boolean }) {
  const { select, setHoverId, home, ctx, trips, filters } = useExplorer();
  const miles = ctx.distances?.get(school.id);
  const commute = trips ? commuteFor(trips.get(school.id), filters.commuteMode) : null;
  const station = school.stations[0];
  const inDistrict = home?.district != null && home.district === school.district;
  return (
    <li>
      <button
        type="button"
        className={`row${recent ? ' row-recent' : ''}`}
        data-id={school.id}
        onClick={() => {
          // A row that disappears when clicked never un-hovers, so clear it here.
          setHoverId(null);
          select(school.id);
        }}
        onMouseEnter={() => setHoverId(school.id)}
        onMouseLeave={() => setHoverId(null)}
        onFocus={() => setHoverId(school.id)}
        onBlur={() => setHoverId(null)}
      >
        <span className="row-name">{school.name}</span>
        {(miles !== undefined || commute !== null) && (
          <span className="row-trip">
            {miles !== undefined && <span>{formatMiles(miles)}</span>}
            {commute !== null && (
              <span>
                ≈ {formatMinutes(commute)} {filters.commuteMode === 'drive' ? 'by car at rush hour' : modeInfo(filters.commuteMode).by}
              </span>
            )}
          </span>
        )}
        <span className="row-meta">
          <span>Grades {gradeRange(school.gradeLow, school.gradeHigh)}</span>
          <span>{school.borough}</span>
          {school.network && <span>{school.network}</span>}
        </span>
        {(station || inDistrict) && (
          <span className="row-foot">
            {station && (
              <span className="row-subway">
                {station.lines.slice(0, 6).map((l) => (
                  <LineBullet key={l} line={l} size="sm" />
                ))}
                <span>{station.walk} min walk</span>
              </span>
            )}
            {inDistrict && <span className="badge-soft">In your district</span>}
          </span>
        )}
      </button>
    </li>
  );
}

export function SchoolList({ hidden }: { hidden: boolean }) {
  const { listed, matching, inViewCount, query, searching, sort, setSort, ctx, camera, setListOpen, lastViewedId, clearFilters } = useExplorer();
  const scrollRef = useRef<HTMLDivElement>(null);
  const saved = useRef(0);
  const options = availableSorts(ctx);
  const current: SortKey = effectiveSort(sort, ctx);
  const someOffScreen = inViewCount < matching.length;

  // "Back to list" returns to the same scroll position, with the school you
  // just looked at in view. Only the list itself scrolls: scrollIntoView would
  // also scroll the page around a phone sheet that's still sliding in.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || hidden) return;
    el.scrollTop = saved.current;
    const row = lastViewedId ? el.querySelector<HTMLElement>(`[data-id="${lastViewedId}"]`) : null;
    if (!row) return;
    const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    const bottom = top + row.offsetHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  }, [hidden, lastViewedId]);

  return (
    <section className="list" hidden={hidden} aria-labelledby="list-heading">
      <header className="list-header">
        <div className="list-title-row">
          <h2 id="list-heading" className="list-title">
            {listHeading({ total: matching.length, inView: inViewCount, query: searching ? query : '' })}
          </h2>
          <button type="button" className="icon-button" onClick={() => setListOpen(false)} aria-label="Hide list" title="Hide list">
            <CloseIcon />
          </button>
        </div>
        <div className="list-tools">
          <label className="sort">
            <span>Sort</span>
            <select className="select compact" value={current} onChange={(e) => setSort(e.target.value as SortKey)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {someOffScreen && matching.length > 0 && (
            <button type="button" className="link-button" onClick={() => camera.fit(matching)}>
              Show all
            </button>
          )}
        </div>
      </header>
      <div
        className="list-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          if (!hidden) saved.current = e.currentTarget.scrollTop;
        }}
      >
        {listed.length > 0 ? (
          <ul className="rows">
            {listed.map((s) => (
              <SchoolRow key={s.id} school={s} recent={s.id === lastViewedId} />
            ))}
          </ul>
        ) : matching.length === 0 ? (
          <div className="empty">
            <p>No schools match {searching ? 'this search and these filters' : 'these filters'}.</p>
            {!searching && (
              <button type="button" className="button" onClick={clearFilters}>
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="empty">
            <p>No matching schools in this part of the map.</p>
            <button type="button" className="button" onClick={() => camera.fit(matching)}>
              Show all {matching.length}
            </button>
          </div>
        )}
        <AboutData />
      </div>
    </section>
  );
}
