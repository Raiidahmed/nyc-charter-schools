// NYC Planning's address search (GeoSearch). Addresses go to this service to
// find a location; they never go into a link.
const BASE = 'https://geosearch.planninglabs.nyc/v2';

export interface Suggestion {
  id: string;
  label: string;
  lat: number;
  lon: number;
  neighborhood: string | null;
  borough: string | null;
}

interface GeoFeature {
  geometry: { coordinates: [number, number] };
  properties: { id?: string; gid?: string; name?: string; label?: string; borough?: string; neighbourhood?: string };
}

function tidy(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, d, s) => d + s.toLowerCase())
    .replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`);
}

function toSuggestion(f: GeoFeature): Suggestion {
  const p = f.properties;
  const name = tidy(p.name ?? p.label?.split(',')[0] ?? 'Address');
  return {
    id: p.gid ?? p.id ?? `${f.geometry.coordinates.join(',')}`,
    label: p.borough ? `${name}, ${p.borough}` : name,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
    neighborhood: p.neighbourhood ?? null,
    borough: p.borough ?? null,
  };
}

export const MIN_QUERY = 3;
export const MAX_SUGGESTIONS = 6;

export async function suggest(text: string, signal?: AbortSignal): Promise<Suggestion[]> {
  if (text.trim().length < MIN_QUERY) return [];
  const res = await fetch(`${BASE}/autocomplete?${new URLSearchParams({ text: text.trim(), size: String(MAX_SUGGESTIONS) })}`, { signal });
  if (!res.ok) throw new Error(`Address search failed (${res.status})`);
  const data = (await res.json()) as { features: GeoFeature[] };
  const seen = new Set<string>();
  return data.features
    .map(toSuggestion)
    .filter((s) => (seen.has(s.label) ? false : (seen.add(s.label), true)))
    .slice(0, MAX_SUGGESTIONS);
}

/** "Mott Haven, Bronx", for labeling a spot from the browser's location or a pin. */
export async function neighborhoodAt(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/reverse?${new URLSearchParams({ 'point.lat': String(lat), 'point.lon': String(lon), size: '1' })}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { features: GeoFeature[] };
    const p = data.features[0]?.properties;
    if (!p) return null;
    return [p.neighbourhood, p.borough].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}
