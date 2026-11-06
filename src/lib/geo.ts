// Small geometry helpers shared by the app and the data scripts.

export type LngLat = [number, number];
export type Ring = LngLat[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

const EARTH_RADIUS_MILES = 3958.8;

/** Straight-line distance in miles. */
export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Streets are longer than straight lines: add 30% and walk at 3 mph. */
export const WALK_DETOUR = 1.3;
export const WALK_MPH = 3;

export function walkMinutes(miles: number): number {
  return Math.max(1, Math.round(((miles * WALK_DETOUR) / WALK_MPH) * 60));
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inPolygon(lon: number, lat: number, polygon: Polygon): boolean {
  if (!inRing(lon, lat, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) if (inRing(lon, lat, polygon[h])) return false;
  return true;
}

export function inMultiPolygon(lon: number, lat: number, multi: MultiPolygon): boolean {
  return multi.some((p) => inPolygon(lon, lat, p));
}

export interface DistrictFeature {
  type: 'Feature';
  properties: { district: number };
  geometry: { type: 'MultiPolygon'; coordinates: MultiPolygon };
}

/** The community school district (1–32) whose outline contains the point. */
export function districtAt(lat: number, lon: number, districts: DistrictFeature[]): number | null {
  for (const f of districts) if (inMultiPolygon(lon, lat, f.geometry.coordinates)) return f.properties.district;
  return null;
}

/** Approximate distance in miles from a point to the nearest edge of an outline. */
export function milesToMultiPolygon(lat: number, lon: number, multi: MultiPolygon): number {
  if (inMultiPolygon(lon, lat, multi)) return 0;
  const kx = Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const poly of multi)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1];
        const [bx, by] = ring[i];
        const dx = (bx - ax) * kx;
        const dy = by - ay;
        const px = (lon - ax) * kx;
        const py = lat - ay;
        const len = dx * dx + dy * dy;
        const t = len ? Math.max(0, Math.min(1, (px * dx + py * dy) / len)) : 0;
        const d = Math.hypot(px - t * dx, py - t * dy);
        if (d < best) best = d;
      }
  return best * 69.05;
}

/**
 * Manhattan's congestion zone, roughly south of 60th Street. The line runs
 * along 60th Street from the Hudson to the East River; the zone is the side
 * that holds the Battery. Callers also check that the point is in Manhattan.
 */
const SIXTIETH_WEST: LngLat = [-73.9935, 40.7737];
const SIXTIETH_EAST: LngLat = [-73.9585, 40.7593];
const MANHATTAN_DISTRICTS = new Set([1, 2, 3, 4, 5, 6]);

export function inCongestionZone(lat: number, lon: number, district: number | null): boolean {
  if (district === null || !MANHATTAN_DISTRICTS.has(district)) return false;
  const [ax, ay] = SIXTIETH_WEST;
  const [bx, by] = SIXTIETH_EAST;
  const side = (bx - ax) * (lat - ay) - (by - ay) * (lon - ax);
  return side < 0;
}

/** True when a point falls inside the five boroughs' rough bounding box. */
export const NYC_BOUNDS: [LngLat, LngLat] = [
  [-74.2591, 40.4774],
  [-73.7004, 40.9176],
];

export function inNycBounds(lat: number, lon: number): boolean {
  return lon >= NYC_BOUNDS[0][0] && lon <= NYC_BOUNDS[1][0] && lat >= NYC_BOUNDS[0][1] && lat <= NYC_BOUNDS[1][1];
}
