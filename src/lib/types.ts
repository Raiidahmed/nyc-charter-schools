import type { Band } from './grades.ts';

export type Borough = 'Bronx' | 'Brooklyn' | 'Manhattan' | 'Queens' | 'Staten Island';
export type Authorizer = 'SUNY' | 'NYCPS' | 'Regents';
/** Federal "regular" is general, "special education" stays, "alternative" is a transfer school. */
export type SchoolType = 'general' | 'special' | 'transfer';
/** New York's accountability status, presented as a support level. */
export type Rating = 'local' | 'tsi' | 'atsi' | 'csi';
export type Access = 'full' | 'partial' | 'none';

export interface Station {
  id: string;
  name: string;
  lines: string[];
  access: Access;
  accessNote?: string;
  /** Estimated walk in minutes to the nearest entrance. */
  walk: number;
  lat: number;
  lon: number;
}

export interface School {
  // Identity
  id: string; // state SED code
  ncesId: string;
  /** The state's institution ID, used for its school profile page. */
  instId: string;
  name: string;
  network: string | null;
  // Oversight
  authorizer: Authorizer;
  opened: number;
  district: number;
  // Students
  gradeLow: number;
  gradeHigh: number;
  bands: Band[];
  enrollment: number | null;
  ratio: number | null;
  type: SchoolType;
  rating: Rating | null;
  // Place
  address: string;
  city: string;
  zip: string;
  borough: Borough;
  phone: string | null;
  stations: Station[];
  lat: number;
  lon: number;
}

export interface SourceInfo {
  key: string;
  name: string;
  publisher: string;
  edition: string;
  url: string;
}

export interface MissingSchool {
  id: string;
  name: string;
  borough: Borough | null;
  district: number | null;
  opened: number;
  reason: 'new' | 'no-location';
}

export interface Summary {
  built: string;
  sources: SourceInfo[];
  enrollmentYear: string;
  ratingYear: number;
  counts: { placed: number; notPlaced: number; setAside: number };
  missing: MissingSchool[];
}

export interface TravelIndex {
  version: number;
  built: string;
  lat0: number;
  lon0: number;
  dlat: number;
  dlon: number;
  rows: number;
  cols: number;
  block: number;
  modes: TravelMode[];
  schools: string[];
  blocks: string[];
  /** Land squares routed. */
  cells: number;
  unreachable: number;
  departure: string;
  windowMinutes: number;
  cutoffs: Record<TravelMode, number>;
  driveCell: number;
  feeds: string[];
}

export type TravelMode = 'transit' | 'walk' | 'drive';
