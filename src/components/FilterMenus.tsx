import { useEffect, useId, useRef, useState } from 'react';
import { groupActiveCount, GROUP_KEYS } from '../lib/filters.ts';
import { plural } from '../lib/format.ts';
import { useExplorer } from '../state/Explorer.tsx';
import { ChevronDownIcon } from '../ui/icons.tsx';
import { FILTER_GROUPS } from './FilterGroups.tsx';

type GroupId = keyof typeof GROUP_KEYS;

/** The footer every filter panel shares. */
export function FilterFooter({ onDone }: { onDone: () => void }) {
  const { clearFilters, matching, setListOpen } = useExplorer();
  return (
    <div className="filter-footer">
      <button type="button" className="button ghost" onClick={clearFilters}>
        Clear all
      </button>
      <button
        type="button"
        className="button primary"
        onClick={() => {
          setListOpen(true);
          onDone();
        }}
      >
        Show {plural(matching.length, 'school')}
      </button>
    </div>
  );
}

/** Desktop: four buttons, each opening a dropdown for its group. */
export function FilterMenus() {
  const { filters, ctx } = useExplorer();
  const [open, setOpen] = useState<GroupId | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<GroupId, HTMLButtonElement>());
  const baseId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        buttons.current.get(open)?.focus();
        setOpen(null);
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="filter-menus" ref={wrapRef}>
      {FILTER_GROUPS.map(({ id, label, Component }) => {
        const n = groupActiveCount(id, filters, ctx);
        const panelId = `${baseId}-${id}`;
        return (
          <div key={id} className="filter-menu">
            <button
              ref={(el) => {
                if (el) buttons.current.set(id, el);
              }}
              type="button"
              className={`button filter-button${n ? ' has-active' : ''}`}
              aria-expanded={open === id}
              aria-controls={panelId}
              onClick={() => setOpen(open === id ? null : id)}
            >
              {label}
              {n > 0 && (
                <span className="badge" aria-label={`${n} active`}>
                  {n}
                </span>
              )}
              <ChevronDownIcon />
            </button>
            {open === id && (
              <div id={panelId} className="dropdown" role="region" aria-label={`${label} filters`}>
                <div className="dropdown-body">
                  <Component />
                </div>
                <FilterFooter onDone={() => setOpen(null)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
