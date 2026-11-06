import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatNumber } from '../lib/format.ts';
import { LINE_COLORS, lineLabel, lineTextColor } from '../lib/subway.ts';

/** The MTA's colored bullet for a line. */
export function LineBullet({ line, size = 'md' }: { line: string; size?: 'sm' | 'md' }) {
  const label = line === 'SIR' ? 'SIR' : line;
  return (
    <span
      className={`bullet bullet-${size}${line.length > 1 ? ' bullet-wide' : ''}`}
      style={{ background: LINE_COLORS[line] ?? '#808183', color: lineTextColor(line) }}
      role="img"
      aria-label={lineLabel(line)}
      title={lineLabel(line)}
    >
      {label}
    </span>
  );
}

/** A toggle option that announces its state and how many schools it would leave. */
export function Option({
  pressed,
  onClick,
  count,
  disabled,
  children,
  hint,
}: {
  pressed: boolean;
  onClick: () => void;
  count?: number;
  disabled?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <button type="button" className="option" aria-pressed={pressed} onClick={onClick} disabled={disabled} title={hint}>
      <span className="option-label">{children}</span>
      {count !== undefined && <span className="option-count">{formatNumber(count)}</span>}
    </button>
  );
}

export function OptionGroup({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="option-group">
      <legend className="option-legend">{label}</legend>
      {hint && <p className="option-hint">{hint}</p>}
      <div className="option-row">{children}</div>
    </fieldset>
  );
}

export function Switch({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

/** Announces a message politely to screen readers, after typing settles. */
export function Announcer({ message }: { message: string }) {
  const [said, setSaid] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaid(message), 600);
    return () => window.clearTimeout(timer.current);
  }, [message]);
  return (
    <div className="visually-hidden" aria-live="polite" aria-atomic="true">
      {said}
    </div>
  );
}
