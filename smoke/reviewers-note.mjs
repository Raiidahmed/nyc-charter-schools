// The reviewers' note text, exactly as specified. The smoke test checks the
// page against it: title, section headings in order, bullets and the five steps.
const RAW = `Methods and assumptions

1. Who it’s for
Four kinds of people, all asking one question: which schools fit my daily life?

* A student or a parent choosing a school.
* A teacher or job seeker looking for somewhere to work.
* A researcher, or anyone using the map as a database of the city’s charters.

That comes down to three needs:

* Getting there: commute, distance and the subway.
* The school itself: grades, size, student–teacher ratio, network and the authorizer that oversees it.
* Getting in: charter lotteries favor students from the school’s own district.

2. The problem
Assumed pain point: the facts a family needs are scattered. The state keeps the official list, the federal government keeps addresses and enrollment, and the MTA keeps the subway. No single resource puts all of this on one map with filters built around finding your best option.
What the map solves: it answers “which schools suit me?” in one place, narrowing about 280 options to a short list. It describes schools and never ranks them.

3. How it was built with AI
Built with Claude Code from the command line and published with GitHub Pages, in five steps:

1. Define the problem broadly and see what the AI produces.
2. Tighten. That’s where the subway layer and the choice of a map with a side list came from.
3. Bug test every user flow with a fine-tooth comb.
4. Ask the AI for critique.
5. Deploy as its own task, then make final touches.`;

const HEADING = /^\d\. (Who it’s for|The problem|How it was built with AI)$/;
const [title, ...rest] = RAW.split('\n').filter((l) => l.trim());
const lines = rest.map((l) => (HEADING.test(l) ? l : l.replace(/^\* /, '').replace(/^\d\. /, '')));

export const REVIEWERS_NOTE = {
  title,
  headings: rest.filter((l) => HEADING.test(l)),
  body: lines.join('\n'),
};
