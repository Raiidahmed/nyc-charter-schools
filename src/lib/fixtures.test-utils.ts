import { bandsFor } from './grades.ts';
import type { School } from './types.ts';

export function school(over: Partial<School> & { id: string }): School {
  const low = over.gradeLow ?? 0;
  const high = over.gradeHigh ?? 5;
  return {
    ncesId: `nces-${over.id}`,
    instId: `inst-${over.id}`,
    name: `School ${over.id}`,
    network: null,
    authorizer: 'SUNY',
    opened: 2010,
    district: 7,
    gradeLow: low,
    gradeHigh: high,
    bands: bandsFor(low, high),
    enrollment: 400,
    ratio: 12,
    type: 'general',
    rating: 'local',
    address: '1 Main St',
    city: 'Bronx',
    zip: '10454',
    borough: 'Bronx',
    phone: null,
    stations: [],
    lat: 40.81,
    lon: -73.91,
    ...over,
  };
}

export const NOW = new Date('2026-11-05T12:00:00');
