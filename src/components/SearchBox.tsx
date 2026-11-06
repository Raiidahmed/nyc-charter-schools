import { useId, useRef } from 'react';
import { useExplorer } from '../state/Explorer.tsx';
import { CloseIcon, SearchIcon } from '../ui/icons.tsx';

/**
 * Typing filters the dots and opens the list of matches without moving the
 * map. Enter frames the matches, or opens the only match. Escape or × clears.
 */
export function SearchBox({ phone = false }: { phone?: boolean }) {
  const { query, setQuery, setListOpen, matching, select, camera } = useExplorer();
  const ref = useRef<HTMLInputElement>(null);
  const id = useId();

  const submit = () => {
    setListOpen(true);
    if (query.trim() && matching.length === 1) select(matching[0].id);
    else if (matching.length) camera.fit(matching);
    if (phone) ref.current?.blur();
  };

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        Search schools
      </label>
      <SearchIcon />
      <input
        ref={ref}
        id={id}
        className="search-input"
        type="search"
        enterKeyHint="search"
        placeholder="Search schools"
        autoComplete="off"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim()) setListOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Clears the search only; an open school stays open.
            e.preventDefault();
            e.stopPropagation();
            setQuery('');
          }
        }}
      />
      {query && (
        <button
          type="button"
          className="icon-button small"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => {
            setQuery('');
            ref.current?.focus();
          }}
        >
          <CloseIcon />
        </button>
      )}
    </form>
  );
}
