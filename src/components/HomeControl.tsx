import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { MIN_QUERY, neighborhoodAt, suggest, type Suggestion } from '../lib/geocode.ts';
import type { HomePlace } from '../lib/filters.ts';
import { useExplorer } from '../state/Explorer.tsx';
import { CloseIcon, HomeIcon, LocateIcon, PinIcon } from '../ui/icons.tsx';

/**
 * Your home: type an address (suggestions from NYC Planning), use the
 * browser's location, or drop a pin. Once set, the box shows the address and
 * district; click it to change.
 */
export function HomeControl({ allowPin = true, autoFocus = false }: { allowPin?: boolean; autoFocus?: boolean }) {
  const { home, setHome, setPinMode, pinMode, setNotice } = useExplorer();
  // Changing the home ends editing, however it changed (address, location or a pin).
  const [editingFrom, setEditingFrom] = useState<HomePlace | null>(null);
  const editing = home !== null && editingFrom === home;
  const setEditing = (on: boolean) => setEditingFrom(on ? home : null);
  const [text, setText] = useState('');
  const [found, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [listOpen, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'locating'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const inputId = useId();

  const showInput = !home || editing;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const longEnough = text.trim().length >= MIN_QUERY;
  const items = longEnough ? found : [];
  const open = longEnough && listOpen;

  useEffect(() => {
    const q = text.trim();
    if (q.length < MIN_QUERY) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      setStatus('loading');
      suggest(q, ctrl.signal)
        .then((list) => {
          setItems(list);
          setActive(list.length ? 0 : -1);
          setOpen(true);
          setStatus('idle');
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') setStatus('error');
        });
    }, 180);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [text]);

  const choose = (s: Suggestion) => {
    if (setHome({ lat: s.lat, lon: s.lon, label: s.label, source: 'address' }, { move: true })) {
      setText('');
      setItems([]);
      setOpen(false);
      setEditing(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter' && open && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      // Escape here must not also close the open school.
      e.preventDefault();
      e.stopPropagation();
      if (open) setOpen(false);
      else if (text) setText('');
      else if (home) setEditing(false);
    }
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setNotice('This browser can’t share its location. Type an address instead.');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setStatus('idle');
        const { latitude: lat, longitude: lon } = pos.coords;
        if (!setHome({ lat, lon, label: 'Current location', source: 'location' }, { move: true })) return;
        setEditing(false);
        const place = await neighborhoodAt(lat, lon);
        if (place) setHome({ lat, lon, label: `Current location · ${place}`, source: 'location' });
      },
      () => {
        setStatus('idle');
        setNotice('Couldn’t get your location. Check the browser’s permission, or type an address.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  };

  if (!showInput && home) {
    return (
      <div className="home-control home-set">
        <button type="button" className="home-address" onClick={() => setEditing(true)} title="Change your home">
          <HomeIcon />
          <span className="home-label">{home.label}</span>
          {home.district !== null && <span className="home-district">District {home.district}</span>}
        </button>
        <button type="button" className="icon-button small" onClick={() => setHome(null)} aria-label="Clear your home" title="Clear your home">
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="home-control">
      <div className="home-input-wrap">
        <label htmlFor={inputId} className="visually-hidden">
          Your home address
        </label>
        <HomeIcon />
        <input
          ref={inputRef}
          id={inputId}
          className="home-input"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
          aria-describedby={status === 'error' ? `${listId}-error` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Your home address"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        />
        <button type="button" className="icon-button small" onClick={locate} aria-label="Use my location" title="Use my location" disabled={status === 'locating'}>
          <LocateIcon />
        </button>
        {allowPin && (
          <button
            type="button"
            className="icon-button small"
            onClick={() => setPinMode(!pinMode)}
            aria-pressed={pinMode}
            aria-label="Drop a pin on the map"
            title="Drop a pin on the map"
          >
            <PinIcon />
          </button>
        )}
        {home && (
          <button type="button" className="icon-button small" onClick={() => setEditing(false)} aria-label="Keep the current home" title="Keep the current home">
            <CloseIcon />
          </button>
        )}
      </div>
      <ul id={listId} role="listbox" aria-label="Address suggestions" className="suggestions" hidden={!open || items.length === 0}>
        {items.map((s, i) => (
          <li
            key={s.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className="suggestion"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(s)}
          >
            {s.label}
            {s.neighborhood && <span className="suggestion-hint">{s.neighborhood}</span>}
          </li>
        ))}
      </ul>
      {status === 'error' && (
        <p id={`${listId}-error`} className="field-error" role="status">
          Address search isn’t responding. Try again, use your location, or drop a pin.
        </p>
      )}
    </div>
  );
}
