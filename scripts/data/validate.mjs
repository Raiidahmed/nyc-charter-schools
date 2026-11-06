// Refuses to publish data that looks wrong. Exits non-zero on any error.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_STATIONS, RATIO_RANGE } from '../../src/lib/constants.ts';
import { inNycBounds, milesToMultiPolygon } from '../../src/lib/geo.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'public', 'data');
const load = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const schools = load('schools.json');
const summary = load('summary.json');
const districts = load('districts.geojson').features;
const stations = load('subway-stations.geojson').features;
const lines = load('subway-lines.geojson').features;

const BOROUGHS = new Set(['Bronx', 'Brooklyn', 'Manhattan', 'Queens', 'Staten Island']);
const AUTHORIZERS = new Set(['SUNY', 'NYCPS', 'Regents']);
const TYPES = new Set(['general', 'special', 'transfer']);
const RATINGS = new Set(['local', 'tsi', 'atsi', 'csi', null]);
const BANDS = new Set(['elementary', 'middle', 'high']);
const ACCESS = new Set(['full', 'partial', 'none']);

if (schools.length < 250 || schools.length > 340) fail(`School count ${schools.length} is outside 250–340`);

const ids = new Set();
for (const s of schools) {
  if (ids.has(s.id)) fail(`Duplicate school ID ${s.id}`);
  ids.add(s.id);
}

const districtNumbers = districts.map((f) => f.properties.district).toSorted((a, b) => a - b);
const expected = Array.from({ length: 32 }, (_, i) => i + 1);
if (JSON.stringify(districtNumbers) !== JSON.stringify(expected))
  fail(`District list is not exactly 1–32: ${districtNumbers.join(', ')}`);
const outline = new Map(districts.map((f) => [f.properties.district, f.geometry.coordinates]));

for (const s of schools) {
  const label = `${s.name} (${s.id})`;
  if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon) || !inNycBounds(s.lat, s.lon)) fail(`${label} is outside the city`);
  if (!BOROUGHS.has(s.borough)) fail(`${label} has unknown borough "${s.borough}"`);
  if (!AUTHORIZERS.has(s.authorizer)) fail(`${label} has unknown authorizer "${s.authorizer}"`);
  if (!TYPES.has(s.type)) fail(`${label} has unknown school type "${s.type}"`);
  if (!RATINGS.has(s.rating)) fail(`${label} has unknown state rating "${s.rating}"`);
  if (!Array.isArray(s.bands) || !s.bands.length || s.bands.some((b) => !BANDS.has(b))) fail(`${label} has bad grade bands`);
  if (!Number.isInteger(s.gradeLow) || !Number.isInteger(s.gradeHigh) || s.gradeLow > s.gradeHigh) fail(`${label} is missing grades`);
  if (!s.address || !s.zip) fail(`${label} is missing its address`);
  if (!s.name) fail(`School ${s.id} has no name`);
  if (!Number.isInteger(s.opened) || s.opened < 1998 || s.opened > new Date().getFullYear() + 1) fail(`${label} has a bad year opened`);
  if (s.enrollment !== null && !(s.enrollment > 0)) fail(`${label} has a bad enrollment`);
  if (s.ratio !== null && !(s.ratio >= RATIO_RANGE[0] && s.ratio <= RATIO_RANGE[1])) fail(`${label} has a bad student–teacher ratio`);
  const poly = outline.get(s.district);
  if (!poly) fail(`${label} has unknown district ${s.district}`);
  else if (milesToMultiPolygon(s.lat, s.lon, poly) > 0.1) fail(`${label} is not inside its own district ${s.district}`);
  if (s.stations.length > MAX_STATIONS) fail(`${label} lists more than ${MAX_STATIONS} stations`);
  for (let i = 0; i < s.stations.length; i++) {
    const st = s.stations[i];
    if (!ACCESS.has(st.access) || !st.lines.length) fail(`${label} has a bad station entry ${st.name}`);
    if (i > 0 && st.walk < s.stations[i - 1].walk) fail(`${label} lists stations out of order`);
  }
}

if (stations.length < 400) fail(`Only ${stations.length} subway stations (expected about 445)`);
const lineNames = new Set(lines.map((f) => f.properties.line));
if (lineNames.size < 20) fail(`Only ${lineNames.size} subway lines (expected about 24)`);

const unrated = schools.filter((s) => s.rating === null);
if (unrated.length > 30) fail(`${unrated.length} schools have no state rating (more than 30)`);

if (!summary.sources?.length) fail('Summary has no sources');
if (summary.counts?.placed !== schools.length) fail('Summary count does not match the school file');

// Travel data is optional: the site works without it and hides commute options.
const travelIndex = join(DATA, 'travel', 'index.json');
if (!existsSync(travelIndex)) {
  warn('No commute data (public/data/travel). Run npm run travel:setup and npm run travel; commute options stay hidden until then.');
} else {
  const index = JSON.parse(readFileSync(travelIndex, 'utf8'));
  const inTravel = new Set(index.schools);
  const missingTravel = schools.filter((s) => !inTravel.has(s.id));
  if (missingTravel.length)
    warn(`${missingTravel.length} schools have no commute times (rerun npm run travel): ${missingTravel.slice(0, 5).map((s) => s.name).join(', ')}`);
  const size = index.modes.length * index.block * index.block * index.schools.length;
  let bad = 0;
  for (const b of index.blocks) {
    const p = join(DATA, 'travel', 'b', `${b}.bin`);
    if (!existsSync(p) || statSync(p).size !== size) bad++;
  }
  if (bad) fail(`${bad} commute block files are missing or the wrong size`);
  if (index.blocks.length < 250) fail(`Only ${index.blocks.length} commute blocks (expected about 330)`);
}

const ratingCounts = {};
for (const s of schools) ratingCounts[s.rating ?? 'none'] = (ratingCounts[s.rating ?? 'none'] ?? 0) + 1;
console.log(`Checked ${schools.length} schools, ${summary.missing.length} not on the map yet, ${stations.length} stations, ${lineNames.size} lines`);
console.log(`State rating: ${Object.entries(ratingCounts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) {
  console.error(`Data check failed with ${errors.length} error${errors.length === 1 ? '' : 's'}.`);
  process.exit(1);
}
console.log(warnings.length ? `Data check passed with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.` : 'Data check passed.');
