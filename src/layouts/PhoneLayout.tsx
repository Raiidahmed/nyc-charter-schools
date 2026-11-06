import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Chips } from '../components/Chips.tsx';
import { FILTER_GROUPS } from '../components/FilterGroups.tsx';
import { FilterFooter } from '../components/FilterMenus.tsx';
import { Guide } from '../components/Guide.tsx';
import { HomeControl } from '../components/HomeControl.tsx';
import { Banners, MapButtons, SubwayToggle } from '../components/MapOverlays.tsx';
import { ReviewersButton, ReviewersNote } from '../components/ReviewersNote.tsx';
import { SchoolDetails } from '../components/SchoolDetails.tsx';
import { SchoolList } from '../components/SchoolList.tsx';
import { SearchBox } from '../components/SearchBox.tsx';
import { activeCount } from '../lib/filters.ts';
import { plural } from '../lib/format.ts';
import { MapView } from '../map/MapView.tsx';
import { useExplorer } from '../state/Explorer.tsx';
import { Announcer } from '../ui/controls.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { FilterIcon } from '../ui/icons.tsx';
import { useMeasure } from './useMeasure.ts';

/** Sheet heights as a share of the screen. */
const LIST_SHEET = 0.52;
const DETAILS_SHEET = 0.72;

export function PhoneLayout({ reviewersHidden, hideReviewers }: { reviewersHidden: boolean; hideReviewers: () => void }) {
  const { listOpen, selected, setListOpen, setDialog, dialog, camera, filters, ctx, matching } = useExplorer();
  const topRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const topBottom = useMeasure(topRef, 'bottom');
  const height = useMeasure(rootRef, 'height');
  const listShown = listOpen && !selected;
  const sheet = selected ? DETAILS_SHEET : listShown ? LIST_SHEET : 0;
  const sheetPx = Math.round(height * sheet);

  useLayoutEffect(() => {
    camera.setPadding({ top: topBottom + 8, right: 0, bottom: sheetPx, left: 0 });
  }, [camera, topBottom, sheetPx]);

  const n = activeCount(filters, ctx);
  const style = { '--top-bottom': `${topBottom}px`, '--sheet-h': `${sheetPx}px` } as CSSProperties;

  return (
    <div className="app phone" ref={rootRef} style={style}>
      <MapView />
      <header className="phone-top" ref={topRef}>
        <div className="phone-title-row">
          <h1 className="title">NYC Charter Schools</h1>
          {reviewersHidden && (
            <button type="button" className="link-button methods" onClick={() => setDialog('reviewers')}>
              Methods
            </button>
          )}
        </div>
        <div className="phone-row">
          <HomeControl />
          <button type="button" className="get-started" onClick={() => setDialog('guide')}>
            Get started
          </button>
        </div>
        <div className="phone-row">
          <SearchBox phone />
          <button type="button" className="button filters-open" onClick={() => setDialog('filters')} aria-label={n ? `Filters, ${n} active` : 'Filters'}>
            <FilterIcon />
            Filters
            {n > 0 && <span className="badge">{n}</span>}
          </button>
        </div>
        <Chips />
      </header>

      <div className="phone-overlay">
        <SubwayToggle />
        {!reviewersHidden && <ReviewersButton onDismiss={hideReviewers} />}
        <Banners />
      </div>

      {!listShown && !selected && (
        <button type="button" className="button show-list phone-show-list" onClick={() => setListOpen(true)}>
          Show list
        </button>
      )}

      <div className={`sheet list-sheet${listShown ? ' open' : ''}`} style={{ height: Math.round(height * LIST_SHEET) }} inert={!listShown}>
        <SchoolList hidden={!listShown} />
      </div>
      <div className={`sheet details-sheet${selected ? ' open' : ''}`} style={{ height: Math.round(height * DETAILS_SHEET) }} inert={!selected}>
        {selected && <SchoolDetails key={selected.id} school={selected} />}
      </div>

      <MapButtons />

      <Dialog
        open={dialog === 'filters'}
        onClose={() => setDialog(null)}
        title="Filters"
        className="filters-dialog"
        footer={<FilterFooter onDone={() => setDialog(null)} />}
      >
        {FILTER_GROUPS.map(({ id, label, Component }) => (
          <section key={id} className="filters-section">
            <h3>{label}</h3>
            <Component />
          </section>
        ))}
      </Dialog>
      <Guide />
      <ReviewersNote />
      <Announcer message={`${plural(matching.length, 'school')} match`} />
    </div>
  );
}
