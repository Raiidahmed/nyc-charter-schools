// Turns the raw downloads into the files the site loads (public/data).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { MAX_STATIONS, NEW_SCHOOL_FROM, RATIO_RANGE, STATION_RADIUS_MILES } from '../../src/lib/constants.ts';
import { districtAt, milesBetween, walkMinutes } from '../../src/lib/geo.ts';
import { bandsFor, parseGrade } from '../../src/lib/grades.ts';
import { LINE_COLORS, sortLines } from '../../src/lib/subway.ts';
import { networkFor } from './networks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = join(ROOT, 'data', 'raw');
const OUT = join(ROOT, 'public', 'data');
mkdirSync(OUT, { recursive: true });

const raw = (name) => JSON.parse(readFileSync(join(RAW, name), 'utf8'));
const round = (n, d = 5) => Math.round(n * 10 ** d) / 10 ** d;
const write = (name, data) => {
  writeFileSync(join(OUT, name), JSON.stringify(data));
  console.log(`  wrote public/data/${name} (${(JSON.stringify(data).length / 1024).toFixed(0)} KB)`);
};

const BOROUGH_BY_COUNTY = {
  Bronx: 'Bronx', 'Bronx County': 'Bronx',
  Kings: 'Brooklyn', 'Kings County': 'Brooklyn',
  'New York': 'Manhattan', 'New York County': 'Manhattan',
  Queens: 'Queens', 'Queens County': 'Queens',
  Richmond: 'Staten Island', 'Richmond County': 'Staten Island',
};
const AUTHORIZERS = { SUNY: 'SUNY', Regents: 'Regents', NYCDOE: 'NYCPS' };
const TYPES = { 'Regular School': 'general', 'Special Education School': 'special', 'Alternative Education School': 'transfer' };
const RATINGS = {
  'Local Support and Improvement': 'local',
  'Targeted Support and Improvement': 'tsi',
  'Additional Targeted Support and Improvement': 'atsi',
  'Comprehensive Support and Improvement': 'csi',
};

// --- Names ---------------------------------------------------------------------
const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'the', 'to']);

function cleanName(name) {
  let n = String(name).replace(/\s+/g, ' ').trim();
  // "Brooklyn Charter School (The)" → "The Brooklyn Charter School"
  const the = n.match(/^(.*?)\s*\(The\)(.*)$/i);
  if (the) n = `The ${the[1]}${the[2]}`.trim();
  // Dashes used as separators become en dashes with spaces.
  n = n.replace(/\s+[-–]\s*|\s*[-–]\s+/g, ' – ').replace(/Charter School-(?=[A-Z])/g, 'Charter School – ');
  n = n.replace(/\(([A-Za-z]{3,6})\)/g, (_, a) => `(${a.toUpperCase()})`);
  n = n.replace(/\bMccloskey\b/g, 'McCloskey').replace(/\bDr (?=[A-Z])/g, 'Dr. ').replace(/\bSt\. ?Hope\b/, 'St. HOPE');
  n = n.replace(/'/g, '’');
  return n;
}

function titleCase(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\b([a-z])([a-z']*)/g, (w, first, rest, offset) =>
      offset > 0 && SMALL_WORDS.has(w) ? w : first.toUpperCase() + rest,
    )
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, d, s2) => d + s2.toLowerCase())
    .replace(/\bMc([a-z])/g, (_, c) => `Mc${c.toUpperCase()}`)
    .replace(/\b(Ne|Nw|Se|Sw)\b/g, (s2) => s2.toUpperCase());
}

// --- Sources -------------------------------------------------------------------
async function readDirectory() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(RAW, 'directory.xlsx'));
  const ws = wb.worksheets[0];
  let header = null;
  const rows = [];
  ws.eachRow((row) => {
    const values = row.values.slice(1).map((v) => (v && typeof v === 'object' && 'result' in v ? v.result : v));
    if (!header) {
      if (values.includes('SED Code')) header = values.map((v) => String(v ?? '').trim());
      return;
    }
    const rec = Object.fromEntries(header.map((h, i) => [h, values[i]]));
    if (rec['SED Code']) rows.push(rec);
  });
  if (!header) throw new Error('Directory spreadsheet has no "SED Code" header row');
  return rows
    .filter((r) => r.Region === 'New York City' || String(r['School District'] ?? '').startsWith('NYC CSD'))
    .map((r) => ({
      id: String(r['SED Code']).padStart(12, '0'),
      instId: String(r['Institution ID'] ?? ''),
      name: String(r['Charter School Name']),
      district: Number(String(r['School District']).match(/\d+/)?.[0]) || null,
      borough: BOROUGH_BY_COUNTY[r.County] ?? null,
      opened: Number(r['Year Opened']),
      authorizer: AUTHORIZERS[r.Authorizer] ?? null,
      rawAuthorizer: r.Authorizer,
    }));
}

function readDistricts() {
  const geo = raw('districts.geojson');
  const byDistrict = new Map();
  for (const f of geo.features) {
    const d = Number(f.properties.schooldist);
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rounded = polys.map((p) => p.map((ring) => ring.map(([x, y]) => [round(x), round(y)])));
    byDistrict.set(d, [...(byDistrict.get(d) ?? []), ...rounded]);
  }
  return [...byDistrict.entries()]
    .toSorted((a, b) => a[0] - b[0])
    .map(([district, coordinates]) => ({
      type: 'Feature',
      properties: { district },
      geometry: { type: 'MultiPolygon', coordinates },
    }));
}

function readStations() {
  const complexes = raw('mta-stations.json');
  const entrances = raw('mta-entrances.json');
  const byComplex = new Map();
  for (const e of entrances) {
    if (e.entry_allowed === 'NO') continue;
    const lat = Number(e.entrance_latitude);
    const lon = Number(e.entrance_longitude);
    if (!lat || !lon) continue;
    const list = byComplex.get(e.complex_id) ?? [];
    list.push([lat, lon]);
    byComplex.set(e.complex_id, list);
  }
  return complexes.map((c) => {
    const lat = Number(c.latitude);
    const lon = Number(c.longitude);
    const ada = String(c.ada);
    return {
      id: String(c.complex_id),
      name: c.stop_name.replace(/-/g, '–').replace(/'/g, '’'),
      lines: sortLines(c.daytime_routes.split(/\s+/).filter(Boolean)),
      access: ada === '1' ? 'full' : ada === '2' ? 'partial' : 'none',
      accessNote: ada === '2' && c.ada_notes && c.ada_notes !== 'NaN' ? c.ada_notes : undefined,
      lat,
      lon,
      entrances: byComplex.get(String(c.complex_id)) ?? [[lat, lon]],
    };
  });
}

function nearbyStations(lat, lon, stations) {
  return stations
    .map((s) => ({ s, miles: Math.min(...s.entrances.map(([a, b]) => milesBetween(lat, lon, a, b))) }))
    .filter((x) => x.miles <= STATION_RADIUS_MILES)
    .toSorted((a, b) => a.miles - b.miles)
    .slice(0, MAX_STATIONS)
    .map(({ s, miles }) => ({
      id: s.id,
      name: s.name,
      lines: s.lines,
      access: s.access,
      ...(s.accessNote ? { accessNote: s.accessNote } : {}),
      walk: walkMinutes(miles),
      lat: s.lat,
      lon: s.lon,
    }));
}

// Douglas–Peucker, so the line shapes stay small.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    let best = -1;
    let bestD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const dx = bx - ax;
      const dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function readLines() {
  const geo = raw('mta-lines.geojson');
  const features = [];
  for (const f of geo.features) {
    let line = String(f.properties.service).replace(/ Peak$/, '');
    if (/^S[FTR]$/.test(line)) line = 'S';
    if (!LINE_COLORS[line]) continue;
    const parts = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const coordinates = parts
      .map((p) => simplify(p, 0.00008).map(([x, y]) => [round(x), round(y)]))
      .filter((p) => p.length > 1);
    features.push({ type: 'Feature', properties: { line, color: LINE_COLORS[line] }, geometry: { type: 'MultiLineString', coordinates } });
  }
  return { type: 'FeatureCollection', features };
}

// --- Build -----------------------------------------------------------------------
const directory = await readDirectory();
const nces = raw('nces.json');
const accountability = raw('accountability.json');
const overrides = existsSync(join(ROOT, 'data', 'overrides.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'data', 'overrides.json'), 'utf8')).schools ?? {}
  : {};
const districts = readDistricts();
const stations = readStations();
const federal = new Map(nces.schools.map((s) => [String(s.ST_LEAID).replace(/^NY-/, ''), s]));
const stateIds = new Set(directory.map((d) => d.id));

console.log('Building school data');
const schools = [];
const missing = [];
let districtFallbacks = 0;
for (const d of directory) {
  const f = federal.get(d.id);
  if (!f || !f.LATCOD || !f.LONCOD) {
    missing.push({
      id: d.id,
      name: cleanName(overrides[d.id]?.name ?? d.name),
      borough: d.borough,
      district: d.district,
      opened: d.opened,
      reason: d.opened >= NEW_SCHOOL_FROM ? 'new' : 'no-location',
    });
    continue;
  }
  const lat = round(f.LATCOD, 6);
  const lon = round(f.LONCOD, 6);
  const low = parseGrade(f.GSLO);
  const high = parseGrade(f.GSHI);
  let district = districtAt(lat, lon, districts);
  if (district === null) {
    district = d.district;
    districtFallbacks++;
  }
  const name = cleanName(d.name);
  const school = {
    id: d.id,
    ncesId: String(f.NCESSCH),
    instId: d.instId,
    name,
    network: networkFor(name),
    authorizer: d.authorizer,
    opened: d.opened,
    district,
    gradeLow: low,
    gradeHigh: high,
    bands: low !== null && high !== null ? bandsFor(low, high) : [],
    enrollment: f.TOTAL > 0 ? f.TOTAL : null,
    ratio: f.STUTERATIO >= RATIO_RANGE[0] && f.STUTERATIO <= RATIO_RANGE[1] ? Math.round(f.STUTERATIO * 10) / 10 : null,
    type: TYPES[f.SCHOOL_TYPE_TEXT] ?? 'general',
    rating: RATINGS[accountability.statuses[d.id]] ?? null,
    address: titleCase([f.LSTREET1, f.LSTREET2].filter(Boolean).join(', ')),
    city: titleCase(f.LCITY),
    zip: String(f.LZIP ?? '').slice(0, 5),
    borough: BOROUGH_BY_COUNTY[f.NMCNTY] ?? d.borough,
    phone: f.PHONE && !/^\(?0/.test(f.PHONE) ? f.PHONE : null,
    stations: nearbyStations(lat, lon, stations),
    lat,
    lon,
  };
  const fix = overrides[d.id];
  if (fix) {
    for (const [k, v] of Object.entries(fix)) if (k !== 'note') school[k] = v;
    if (fix.lat || fix.lon) {
      school.stations = nearbyStations(school.lat, school.lon, stations);
      school.district = districtAt(school.lat, school.lon, districts) ?? school.district;
    }
  }
  schools.push(school);
}
for (const id of Object.keys(overrides)) if (!stateIds.has(id)) console.warn(`  warning: override for unknown school ${id}`);
schools.sort((a, b) => a.name.localeCompare(b.name, 'en')); // oxlint-disable-line no-array-sort -- sorting our own array in place
missing.sort((a, b) => a.name.localeCompare(b.name, 'en')); // oxlint-disable-line no-array-sort
const setAside = nces.schools.filter((s) => !stateIds.has(String(s.ST_LEAID).replace(/^NY-/, '')));

console.log(`  ${schools.length} schools on the map, ${missing.length} not on the map yet`);
console.log(`  ${setAside.length} federal records set aside (closed or merged): ${setAside.map((s) => s.SCH_NAME).join(', ') || 'none'}`);
if (districtFallbacks) console.log(`  ${districtFallbacks} schools used the state's district listing`);

// --- Subway map layers -------------------------------------------------------------
const stationLayer = {
  type: 'FeatureCollection',
  features: stations.map((s) => ({
    type: 'Feature',
    properties: { id: s.id, name: s.name, lines: s.lines.join(' '), access: s.access },
    geometry: { type: 'Point', coordinates: [round(s.lon), round(s.lat)] },
  })),
};

// --- Summary ---------------------------------------------------------------------
const dirMeta = raw('directory.meta.json');
const distMeta = raw('districts.meta.json');
const mtaMeta = raw('mta.meta.json');
const accMeta = raw('accountability.meta.json');
const fmtDate = (iso) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'unknown';
const enrollmentYear = String(nces.schools[0]?.SURVYEAR ?? nces.edition).replace(/^(\d{4})-\d{2}(\d{2})$/, '$1–$2');
const summary = {
  built: new Date().toISOString(),
  sources: [
    { key: 'directory', name: 'Charter school directory', publisher: 'New York State Education Department', edition: `As of ${fmtDate(dirMeta.asOf)}`, url: dirMeta.page },
    { key: 'nces', name: 'EDGE public school data', publisher: 'National Center for Education Statistics', edition: `${nces.edition} school year`, url: 'https://nces.ed.gov/programs/edge/Geographic/SchoolLocations' },
    { key: 'accountability', name: 'Report card database (accountability status)', publisher: 'New York State Education Department', edition: `${accountability.year} status, ${accountability.database} release`, url: 'https://data.nysed.gov/downloads.php' },
    { key: 'districts', name: distMeta.name, publisher: 'NYC Open Data', edition: `Updated ${fmtDate(distMeta.updated)}`, url: distMeta.url },
    ...['stations', 'entrances', 'lines'].map((k) => ({
      key: `mta-${k}`,
      name: mtaMeta[k].name,
      publisher: 'MTA, via Open NY',
      edition: `Updated ${fmtDate(mtaMeta[k].updated)}`,
      url: mtaMeta[k].url,
    })),
  ],
  enrollmentYear,
  ratingYear: accountability.year,
  ratingSource: accMeta.url,
  counts: { placed: schools.length, notPlaced: missing.length, setAside: setAside.length },
  missing,
};

write('schools.json', schools);
write('summary.json', summary);
write('districts.geojson', { type: 'FeatureCollection', features: districts });
write('subway-stations.geojson', stationLayer);
write('subway-lines.geojson', readLines());
