import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { Chips } from '../components/Chips.tsx';
import { FilterMenus } from '../components/FilterMenus.tsx';
import { Guide } from '../components/Guide.tsx';
import { HomeControl } from '../components/HomeControl.tsx';
import { Banners, MapButtons, SubwayToggle } from '../components/MapOverlays.tsx';
import { ReviewersButton, ReviewersNote } from '../components/ReviewersNote.tsx';
import { SchoolDetails } from '../components/SchoolDetails.tsx';
import { SchoolList } from '../components/SchoolList.tsx';
import { SearchBox } from '../components/SearchBox.tsx';
import { plural } from '../lib/format.ts';
import { MapView } from '../map/MapView.tsx';
import { useExplorer } from '../state/Explorer.tsx';
import { Announcer } from '../ui/controls.tsx';
import { useMeasure } from './useMeasure.ts';

const GAP = 12;
const PANEL_WIDTH = 400;

export function DesktopLayout({ reviewersHidden, hideReviewers }: { reviewersHidden: boolean; hideReviewers: () => void }) {
  const { panelOpen, selected, setListOpen, setDialog, camera, matching } = useExplorer();
  const barRef = useRef<HTMLElement>(null);
  const barBottom = useMeasure(barRef, 'bottom');

  // Tell the map which parts of the screen are covered, without moving it.
  useLayoutEffect(() => {
    camera.setPadding({ top: barBottom + GAP, right: panelOpen ? PANEL_WIDTH + GAP * 2 : 0, bottom: 0, left: 0 });
  }, [camera, barBottom, panelOpen]);

  const style = { '--bar-bottom': `${barBottom}px`, '--panel-w': `${PANEL_WIDTH}px` } as CSSProperties;

  return (
    <div className={`app desktop${panelOpen ? ' panel-open' : ''}`} style={style}>
      <MapView />
      <header className="topbar" ref={barRef}>
        <div className="topbar-row">
          <div className="brand">
            <h1 className="title">NYC Charter Schools</h1>
            {reviewersHidden && (
              <button type="button" className="link-button methods" onClick={() => setDialog('reviewers')}>
                Methods
              </button>
            )}
          </div>
          <HomeControl />
          <button type="button" className="get-started" onClick={() => setDialog('guide')}>
            Get started
          </button>
          <SubwayToggle />
        </div>
        <div className="topbar-second">
          <SearchBox />
          <FilterMenus />
          <Chips />
        </div>
      </header>

      <div className="overlay-left">
        {!reviewersHidden && <ReviewersButton onDismiss={hideReviewers} />}
        <Banners />
      </div>

      <div className="overlay-right">
        {panelOpen ? (
          <aside className="panel" aria-label="Schools">
            <SchoolList hidden={selected !== null} />
            {selected && <SchoolDetails key={selected.id} school={selected} />}
          </aside>
        ) : (
          <button type="button" className="button show-list" onClick={() => setListOpen(true)}>
            Show list
          </button>
        )}
      </div>

      <MapButtons />
      <Guide />
      <ReviewersNote />
      <Announcer message={`${plural(matching.length, 'school')} match`} />
    </div>
  );
}
