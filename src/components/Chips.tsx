import { chipsFor } from '../lib/filters.ts';
import { useExplorer } from '../state/Explorer.tsx';
import { CloseIcon } from '../ui/icons.tsx';

/** Each active filter as a removable chip. Filters waiting on a home show none. */
export function Chips({ withClear = true }: { withClear?: boolean }) {
  const { filters, setFilters, ctx, clearFilters } = useExplorer();
  const chips = chipsFor(filters, ctx);
  if (!chips.length) return null;
  return (
    <div className="chips" role="group" aria-label="Active filters">
      {chips.map((c) => (
        <button key={c.id} type="button" className="chip" onClick={() => setFilters(c.without)} aria-label={`Remove filter: ${c.label}`} title="Remove filter">
          <span>{c.label}</span>
          <CloseIcon />
        </button>
      ))}
      {withClear && (
        <button type="button" className="chip-clear" onClick={clearFilters}>
          Clear all
        </button>
      )}
    </div>
  );
}
