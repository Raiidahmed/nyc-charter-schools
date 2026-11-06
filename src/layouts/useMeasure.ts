import { useLayoutEffect, useState, type RefObject } from 'react';

/** Tracks an element's bottom edge or height as it wraps and resizes. */
export function useMeasure(ref: RefObject<HTMLElement | null>, what: 'bottom' | 'height' | 'width'): number {
  const [value, setValue] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setValue(Math.round(what === 'bottom' ? r.bottom : what === 'height' ? r.height : r.width));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener('resize', read);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', read);
    };
  }, [ref, what]);
  return value;
}
