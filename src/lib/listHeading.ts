const schools = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'school' : 'schools'}`;

/**
 * The results list heading, in one of three forms:
 *   "280 schools"                  every match is in view
 *   "12 of 280 schools in view"    some matches are off screen or behind the panel
 *   "9 schools match “kipp”"       while searching, every match is listed
 */
export function listHeading({ total, inView, query }: { total: number; inView: number; query: string }): string {
  const q = query.trim();
  if (q) return `${total === 0 ? 'No schools' : schools(total)} ${total === 1 ? 'matches' : 'match'} “${q}”`;
  if (inView >= total) return schools(total);
  return `${inView.toLocaleString('en-US')} of ${schools(total)} in view`;
}
