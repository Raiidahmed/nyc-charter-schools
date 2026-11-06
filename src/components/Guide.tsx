import { useMemo, useState } from 'react';
import { applyFilters } from '../lib/filters.ts';
import { plural } from '../lib/format.ts';
import { ADMISSIONS_CHECKED, ADMISSIONS_LINKS, guideResult, questionsFor, ROLES, type Answers, type Question, type Role } from '../lib/guide.ts';
import { useExplorer } from '../state/Explorer.tsx';
import { Dialog } from '../ui/Dialog.tsx';
import { Chips } from './Chips.tsx';
import { HomeControl } from './HomeControl.tsx';

type Step = { kind: 'role' } | { kind: 'question'; index: number } | { kind: 'done' };

function Progress({ total, current }: { total: number; current: number }) {
  return (
    <div className="progress" role="img" aria-label={`Question ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`dot${i === current ? ' current' : i < current ? ' done' : ''}`} />
      ))}
    </div>
  );
}

function QuestionView({ q, answers, onAnswer, onNext }: { q: Question; answers: Answers; onAnswer: (a: Answers, advance: boolean) => void; onNext: () => void }) {
  const { home } = useExplorer();
  const value = q.id === 'home' ? undefined : answers[q.id];
  if (q.kind === 'home') {
    return (
      <div className="question">
        <HomeControl allowPin={false} autoFocus />
        {home && <p className="muted">Home set: {home.label}.</p>}
        <div className="question-actions">
          <button type="button" className="button primary" onClick={onNext}>
            {home ? 'Next' : 'Skip'}
          </button>
        </div>
      </div>
    );
  }
  if (q.kind === 'single') {
    return (
      <div className="question choices" role="group" aria-label={q.title}>
        {q.options.map((o) => {
          const v = q.id === 'grade' || q.id === 'commute' ? Number(o.id) : o.id;
          return (
            <button key={o.id} type="button" className="choice" aria-pressed={value === v} onClick={() => onAnswer({ ...answers, [q.id]: v }, true)}>
              <span>{o.label}</span>
              {o.hint && <span className="choice-hint">{o.hint}</span>}
            </button>
          );
        })}
      </div>
    );
  }
  const picked = (value as string[] | undefined) ?? [];
  const full = q.max !== undefined && picked.length >= q.max;
  return (
    <div className="question">
      <div className="choices" role="group" aria-label={q.title}>
        {q.options.map((o) => {
          const on = picked.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              className="choice"
              aria-pressed={on}
              disabled={!on && full}
              onClick={() => onAnswer({ ...answers, [q.id]: on ? picked.filter((p) => p !== o.id) : [...picked, o.id] }, false)}
            >
              <span>{o.label}</span>
              {o.hint && <span className="choice-hint">{o.hint}</span>}
            </button>
          );
        })}
      </div>
      <div className="question-actions">
        <button type="button" className="button primary" onClick={onNext}>
          {picked.length ? 'Next' : 'Skip'}
        </button>
      </div>
    </div>
  );
}

function NextSteps({ role }: { role: Role }) {
  const { home, setDialog } = useExplorer();
  if (role === 'parent' || role === 'student') {
    return (
      <section className="next-steps">
        <h3>How applying works</h3>
        <ul>
          <li>Charter schools admit students by lottery, usually held in April or May.</li>
          <li>Applications are typically due April 1.</li>
          <li>Many schools share one common online application, so you can apply to several at once.</li>
          <li>
            {home?.district != null
              ? `You live in District ${home.district}. Lotteries give preference to students from the school’s own district, so schools in District ${home.district} favor you.`
              : 'Lotteries give preference to students from the school’s own district. Add your address to see which district is yours.'}
          </li>
        </ul>
        <p className="links">
          <a href={ADMISSIONS_LINKS.guide} target="_blank" rel="noopener noreferrer">
            NYC Public Schools’ guide to charter schools
          </a>
          <a href={ADMISSIONS_LINKS.commonApp} target="_blank" rel="noopener noreferrer">
            The common online application
          </a>
        </p>
        <p className="muted small">Admissions details checked {ADMISSIONS_CHECKED}. They change each year, so confirm dates with each school.</p>
      </section>
    );
  }
  if (role === 'educator') {
    return (
      <section className="next-steps">
        <h3>Finding openings</h3>
        <p>Most networks post openings on their own careers pages; independent schools usually list jobs on their websites. Open a school to see its network, then search for that network’s careers page.</p>
      </section>
    );
  }
  return (
    <section className="next-steps">
      <h3>The data</h3>
      <p>Every school is a record with its grades, enrollment, ratio, network, authorizer, rating and nearby stations. The full data notes explain each source and assumption.</p>
      <button type="button" className="button" onClick={() => setDialog('reviewers')}>
        Read the full data notes
      </button>
    </section>
  );
}

function GuideFlow() {
  const { home, data, ctx, filters, setFilters, setSort, setQuery, setListOpen, setDialog, matching } = useExplorer();
  const [role, setRole] = useState<Role | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState<Step>({ kind: 'role' });
  const questions = role ? questionsFor(role, answers, !!home) : [];

  const preview = useMemo(() => {
    if (!role) return data.schools.length;
    const { filters: f } = guideResult(role, answers, !!home, filters.commuteMode);
    return applyFilters(data.schools, f, ctx).length;
  }, [role, answers, home, filters.commuteMode, data.schools, ctx]);

  const finish = (r: Role, a: Answers) => {
    const result = guideResult(r, a, !!home, filters.commuteMode);
    setFilters(result.filters);
    setSort(result.sort);
    setQuery('');
    setListOpen(true);
    setStep({ kind: 'done' });
  };

  const go = (index: number, r = role!, a = answers) => {
    const qs = questionsFor(r, a, !!home);
    if (index >= qs.length) finish(r, a);
    else setStep({ kind: 'question', index });
  };

  if (step.kind === 'role') {
    return (
      <div className="guide-step">
        <p className="guide-lead">A few quick questions set the filters for you. Every question can be skipped.</p>
        <h3 className="guide-question">Who are you?</h3>
        <div className="choices roles" role="group" aria-label="Who are you?">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              className="choice role"
              onClick={() => {
                setRole(r.id);
                setAnswers({});
                go(0, r.id, {});
              }}
            >
              <span>{r.label}</span>
              <span className="choice-hint">{r.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step.kind === 'done') {
    return (
      <div className="guide-step">
        <h3 className="guide-question">We found {plural(matching.length, 'school')} that fit</h3>
        <Chips withClear={false} />
        <NextSteps role={role!} />
        <div className="question-actions">
          <button type="button" className="button primary" onClick={() => setDialog(null)}>
            Show {plural(matching.length, 'school')}
          </button>
        </div>
      </div>
    );
  }

  const q = questions[Math.min(step.index, questions.length - 1)];
  return (
    <div className="guide-step">
      <div className="guide-progress">
        <Progress total={questions.length} current={step.index} />
        <span className="guide-count" aria-live="polite">
          {plural(preview, 'school')} {preview === 1 ? 'matches' : 'match'} so far
        </span>
      </div>
      <h3 className="guide-question">{q.title}</h3>
      {q.hint && <p className="muted">{q.hint}</p>}
      <QuestionView
        key={q.id}
        q={q}
        answers={answers}
        onAnswer={(a, advance) => {
          setAnswers(a);
          if (advance) go(step.index + 1, role!, a);
        }}
        onNext={() => go(step.index + 1)}
      />
      <div className="guide-nav">
        <button type="button" className="link-button" onClick={() => (step.index === 0 ? setStep({ kind: 'role' }) : setStep({ kind: 'question', index: step.index - 1 }))}>
          ‹ Back
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            const a = { ...answers };
            if (q.id !== 'home') delete a[q.id];
            setAnswers(a);
            go(step.index + 1, role!, a);
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

/** "Get started": a dialog that asks a few questions and sets the filters. It starts fresh each time. */
export function Guide() {
  const { dialog, setDialog } = useExplorer();
  const open = dialog === 'guide';
  return (
    <Dialog open={open} onClose={() => setDialog(null)} title="Get started" className="guide-dialog">
      {open && <GuideFlow />}
    </Dialog>
  );
}
