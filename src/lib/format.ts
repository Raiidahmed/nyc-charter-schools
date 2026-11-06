import { modeInfo } from './labels.ts';
import type { School, TravelMode } from './types.ts';

export function formatMiles(miles: number): string {
  if (miles < 0.1) return '< 0.1 mi';
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

export function googleDirections(from: { lat: number; lon: number } | null, school: School, mode: TravelMode | null): string {
  const p = new URLSearchParams({ api: '1', destination: `${school.address}, ${school.city}, NY ${school.zip}` });
  if (from) p.set('origin', `${from.lat.toFixed(5)},${from.lon.toFixed(5)}`);
  if (mode) p.set('travelmode', modeInfo(mode).google);
  return `https://www.google.com/maps/dir/?${p}`;
}

export function stateProfileUrl(school: School): string {
  return `https://data.nysed.gov/profile.php?instid=${encodeURIComponent(school.instId)}`;
}

export function federalProfileUrl(school: School): string {
  return `https://nces.ed.gov/ccd/schoolsearch/school_detail.asp?ID=${encodeURIComponent(school.ncesId)}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}
