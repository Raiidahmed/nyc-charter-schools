import type { School } from './types.ts';

/** Lowercase, accents removed, punctuation as spaces. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function searchWords(query: string): string[] {
  return normalize(query).split(' ').filter(Boolean);
}

const haystacks = new WeakMap<School, string>();

function haystack(s: School): string {
  let h = haystacks.get(s);
  if (h === undefined) {
    h = ` ${normalize([s.name, s.network ?? '', s.address, s.city, s.borough, s.zip].join(' '))} `;
    haystacks.set(s, h);
  }
  return h;
}

/**
 * Every word typed must start a word in the school's name, network or
 * address, so "7" finds Icahn Charter School 7 but not zip code 10457.
 */
export function matchesSearch(school: School, query: string): boolean {
  const words = searchWords(query);
  if (!words.length) return true;
  const h = haystack(school);
  return words.every((w) => h.includes(` ${w}`));
}

export function isSearching(query: string): boolean {
  return searchWords(query).length > 0;
}
