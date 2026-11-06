import { useExplorer } from '../state/Explorer.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { CloseIcon } from '../ui/icons.tsx';
import {
  commuteNote,
  cutoffNote,
  HOME_NOTE,
  LEFT_OUT_NOTE,
  ratingNote,
  rushNote,
  schoolFacts,
  Sources,
  SUBWAY_NOTE,
  whichSchools,
} from './DataNotes.tsx';

const REVIEWERS_TITLE = 'Methods and assumptions';

/** The blue "Reviewers: start here" button, with its own ×. */
export function ReviewersButton({ onDismiss }: { onDismiss: () => void }) {
  const { setDialog } = useExplorer();
  return (
    <div className="reviewers">
      <button type="button" className="reviewers-open" onClick={() => setDialog('reviewers')}>
        Reviewers: start here
      </button>
      <button type="button" className="reviewers-close" onClick={onDismiss} aria-label="Hide the reviewers’ button" title="Hide until the page reloads">
        <CloseIcon />
      </button>
    </div>
  );
}

/** The reviewers' note. The three numbered sections are used word for word. */
export function ReviewersNote() {
  const { dialog, setDialog, data, travelIndex } = useExplorer();
  const { summary } = data;
  return (
    <Dialog open={dialog === 'reviewers'} onClose={() => setDialog(null)} title={REVIEWERS_TITLE} className="note-dialog">
      <section className="note-section">
        <h3>1. Who it’s for</h3>
        <p>Four kinds of people, all asking one question: which schools fit my daily life?</p>
        <ul>
          <li>A student or a parent choosing a school.</li>
          <li>A teacher or job seeker looking for somewhere to work.</li>
          <li>A researcher, or anyone using the map as a database of the city’s charters.</li>
        </ul>
        <p>That comes down to three needs:</p>
        <ul>
          <li>Getting there: commute, distance and the subway.</li>
          <li>The school itself: grades, size, student–teacher ratio, network and the authorizer that oversees it.</li>
          <li>Getting in: charter lotteries favor students from the school’s own district.</li>
        </ul>
      </section>
      <section className="note-section">
        <h3>2. The problem</h3>
        <p>
          Assumed pain point: the facts a family needs are scattered. The state keeps the official list, the federal government keeps addresses and enrollment, and the
          MTA keeps the subway. No single resource puts all of this on one map with filters built around finding your best option.
        </p>
        <p>What the map solves: it answers “which schools suit me?” in one place, narrowing about 280 options to a short list. It describes schools and never ranks them.</p>
      </section>
      <section className="note-section">
        <h3>3. How it was built with AI</h3>
        <p>Built with Claude Code from the command line and published with GitHub Pages, in five steps:</p>
        <ol>
          <li>Define the problem broadly and see what the AI produces.</li>
          <li>Tighten. That’s where the subway layer and the choice of a map with a side list came from.</li>
          <li>Bug test every user flow with a fine-tooth comb.</li>
          <li>Ask the AI for critique.</li>
          <li>Deploy as its own task, then make final touches.</li>
        </ol>
      </section>
      <details className="assumptions">
        <summary>Data and estimate assumptions</summary>
        <dl className="assumption-list">
          <dt>Which schools</dt>
          <dd>{whichSchools(summary)}</dd>
          <dt>School facts</dt>
          <dd>{schoolFacts(summary)}</dd>
          <dt>Home, distance and district</dt>
          <dd>{HOME_NOTE}</dd>
          <dt>Commute estimates</dt>
          <dd>{commuteNote(travelIndex)}</dd>
          <dt>Rush hour</dt>
          <dd>{rushNote(travelIndex)}</dd>
          <dt>Trip cutoffs</dt>
          <dd>{cutoffNote(travelIndex)}</dd>
          <dt>Subway access</dt>
          <dd>{SUBWAY_NOTE}</dd>
          <dt>State rating</dt>
          <dd>{ratingNote(summary)}</dd>
          <dt>Left out on purpose</dt>
          <dd>{LEFT_OUT_NOTE}</dd>
        </dl>
      </details>
      <section className="note-section note-sources">
        <h3>Sources</h3>
        <Sources />
      </section>
    </Dialog>
  );
}
