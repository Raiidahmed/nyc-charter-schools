import { useExplorer } from '../state/Explorer.tsx';
import { commuteNote, cutoffNote, HOME_NOTE, NotPlaced, PLACEMENT_NOTE, ratingNote, rushNote, Sources, SUBWAY_NOTE } from './DataNotes.tsx';

/** "About the data", the collapsible footer at the bottom of the list. */
export function AboutData() {
  const { data, travelIndex } = useExplorer();
  const { summary } = data;
  const built = new Date(summary.built).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <details className="about">
      <summary>About the data</summary>
      <div className="about-body">
        <h3>Sources</h3>
        <Sources />
        <p className="muted">Data built {built}.</p>
        <h3>Placement and networks</h3>
        <p>{PLACEMENT_NOTE}</p>
        <h3>District and privacy</h3>
        <p>{HOME_NOTE} If you tick “Remember my address on this device”, it’s kept in this browser’s local storage and nowhere else.</p>
        <h3>Subway walks</h3>
        <p>{SUBWAY_NOTE}</p>
        <h3>State rating</h3>
        <p>{ratingNote(summary)}</p>
        <h3>Commutes</h3>
        <p>
          {commuteNote(travelIndex)} {travelIndex && rushNote(travelIndex)} {travelIndex && cutoffNote(travelIndex)}
        </p>
        <h3 id="not-on-map">Not on the map yet</h3>
        <p>These schools are on the state’s list but have no federal location record yet, so they can’t be placed.</p>
        <NotPlaced />
      </div>
    </details>
  );
}
