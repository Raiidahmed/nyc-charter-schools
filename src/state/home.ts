// The home lives in memory, or in this browser's local storage when the
// person ticks "Remember my address on this device". It never goes in a link.
import type { HomePlace } from '../lib/filters.ts';
import { districtAt, milesToMultiPolygon, type DistrictFeature } from '../lib/geo.ts';

const KEY = 'nyc-charter-schools:home';

export function loadRememberedHome(): HomePlace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as HomePlace;
    return Number.isFinite(h.lat) && Number.isFinite(h.lon) && typeof h.label === 'string' ? h : null;
  } catch {
    return null;
  }
}

export function saveRememberedHome(home: HomePlace | null) {
  try {
    if (home) localStorage.setItem(KEY, JSON.stringify(home));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be unavailable (private windows); the home still works in memory.
  }
}

/**
 * The district for a home, or undefined when the spot is outside the city.
 * Points just off a simplified shoreline count as the nearest district.
 */
export function homeDistrict(lat: number, lon: number, districts: DistrictFeature[]): number | undefined {
  const d = districtAt(lat, lon, districts);
  if (d !== null) return d;
  let best: { d: number; miles: number } | null = null;
  for (const f of districts) {
    const miles = milesToMultiPolygon(lat, lon, f.geometry.coordinates);
    if (!best || miles < best.miles) best = { d: f.properties.district, miles };
  }
  return best && best.miles <= 0.15 ? best.d : undefined;
}
