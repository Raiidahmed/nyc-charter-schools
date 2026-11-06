// Downloads every source into data/raw (not committed).
//
//   npm run data:fetch                     all sources
//   npm run data:fetch -- --accountability just the state rating
//
// The state's static website (www.nysed.gov) serves an incomplete certificate
// chain, so we ship the missing GlobalSign intermediate and trust it here.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import MDBReader from 'mdb-reader';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const RAW = join(ROOT, 'data', 'raw');
mkdirSync(RAW, { recursive: true });

tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(join(HERE, 'certs', 'globalsign-rsa-ov-ssl-ca-2018.pem'), 'utf8'),
]);

const NYC_COUNTIES = ['Bronx County', 'Kings County', 'New York County', 'Queens County', 'Richmond County'];

async function get(url, as = 'json', init = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (as === 'json') return await res.json();
      if (as === 'text') return await res.text();
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

function save(name, data) {
  writeFileSync(join(RAW, name), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
  console.log(`  saved data/raw/${name}`);
}

// --- State charter school directory ------------------------------------------
async function fetchDirectory() {
  console.log('State charter school directory');
  const page = 'https://www.nysed.gov/charter-schools/charter-schools-directory';
  const html = await get(page, 'text');
  const href = html.match(/href="([^"]*charter-school-directory[^"]*\.xlsx)"/i)?.[1];
  if (!href) throw new Error(`No directory spreadsheet linked from ${page}`);
  const url = new URL(href, page).href;
  const m = url.match(/as-of-(\d{2})-(\d{2})-(\d{4})/);
  const asOf = m ? `${m[3]}-${m[1]}-${m[2]}` : null;
  save('directory.xlsx', await get(url, 'buffer'));
  save('directory.meta.json', { url, page, asOf, fetched: new Date().toISOString() });
}

// --- NCES EDGE public school data --------------------------------------------
async function fetchNces() {
  console.log('NCES EDGE public school data');
  const base = 'https://nces.ed.gov/opengis/rest/services/K12_School_Locations';
  const list = await get(`${base}?f=json`);
  const services = list.services
    .map((s) => s.name.split('/').pop())
    .filter((n) => /^EDGE_ADMINDATA_PUBLICSCH_\d{4}$/.test(n))
    .toSorted();
  const service = services.at(-1);
  if (!service) throw new Error('No EDGE_ADMINDATA_PUBLICSCH service found');
  const yy = service.slice(-4);
  const edition = `20${yy.slice(0, 2)}–${yy.slice(2)}`;
  const info = await get(`${base}/${service}/MapServer?f=json`);
  const layer = info.layers.find((l) => l.type === 'Feature Layer')?.id ?? 0;
  const where = `LSTATE='NY' AND CHARTER_TEXT='Yes' AND NMCNTY IN (${NYC_COUNTIES.map((c) => `'${c}'`).join(',')})`;
  const fields = [
    'NCESSCH', 'ST_LEAID', 'SCH_NAME', 'LSTREET1', 'LSTREET2', 'LCITY', 'LZIP', 'PHONE', 'NMCNTY',
    'GSLO', 'GSHI', 'TOTAL', 'STUTERATIO', 'SCHOOL_TYPE_TEXT', 'SY_STATUS_TEXT', 'VIRTUAL',
    'LATCOD', 'LONCOD', 'SURVYEAR',
  ];
  const features = [];
  for (let offset = 0; ; offset += 1000) {
    const q = new URLSearchParams({
      where, outFields: fields.join(','), returnGeometry: 'false', f: 'json',
      resultOffset: String(offset), resultRecordCount: '1000', orderByFields: 'NCESSCH',
    });
    const page = await get(`${base}/${service}/MapServer/${layer}/query?${q}`);
    if (page.error) throw new Error(`NCES query failed: ${JSON.stringify(page.error)}`);
    features.push(...page.features.map((f) => f.attributes));
    if (!page.exceededTransferLimit && page.features.length < 1000) break;
  }
  save('nces.json', { service, edition, url: `${base}/${service}/MapServer/${layer}`, fetched: new Date().toISOString(), schools: features });
  console.log(`  ${features.length} federal charter records (${edition})`);
}

// --- Socrata (NYC Open Data and data.ny.gov) ---------------------------------
async function socrataEdition(domain, id) {
  const meta = await get(`https://${domain}/api/views/${id}.json`);
  const t = meta.rowsUpdatedAt ?? meta.viewLastModified;
  return { name: meta.name, updated: t ? new Date(t * 1000).toISOString().slice(0, 10) : null };
}

async function fetchDistricts() {
  console.log('NYC school district boundaries');
  const id = '8ugf-3d8u';
  // Simplified on the server (about 15 m tolerance) so the file stays small.
  const q = new URLSearchParams({
    $select: 'schooldist,simplify_preserve_topology(the_geom,0.00015) as the_geom',
    $limit: '1000',
  });
  const geo = await get(`https://data.cityofnewyork.us/resource/${id}.geojson?${q}`);
  save('districts.geojson', geo);
  save('districts.meta.json', { id, url: `https://data.cityofnewyork.us/d/${id}`, ...(await socrataEdition('data.cityofnewyork.us', id)) });
}

async function fetchSubway() {
  console.log('MTA subway stations, entrances and lines');
  const sets = {
    stations: '5f5g-n3cz', // MTA Subway Stations and Complexes
    entrances: 'i9wp-a4ja', // MTA Subway Entrances and Exits
    lines: 's692-irgq', // MTA Subway Service Lines
  };
  const meta = {};
  for (const [key, id] of Object.entries(sets)) {
    const ext = key === 'lines' ? 'geojson' : 'json';
    const data = await get(`https://data.ny.gov/resource/${id}.${ext}?$limit=50000`);
    save(`mta-${key}.${ext === 'geojson' ? 'geojson' : 'json'}`, data);
    meta[key] = { id, url: `https://data.ny.gov/d/${id}`, ...(await socrataEdition('data.ny.gov', id)) };
  }
  save('mta.meta.json', meta);
}

// --- NYS report card database: accountability status --------------------------
// A 390 MB zip holding a 1.6 GB Access database. We check the file size first
// and only download again when the state publishes a new one; we keep a small
// result and delete the big files.
async function fetchAccountability() {
  console.log('NYS report card database (accountability status)');
  const page = 'https://data.nysed.gov/downloads.php';
  const html = await get(page, 'text');
  const links = [...html.matchAll(/href="([^"]*\/SRC(\d{4})\.zip)"/g)].map((m) => ({ href: m[1], year: +m[2] }));
  if (!links.length) throw new Error(`No report card database linked from ${page}`);
  const latest = links.toSorted((a, b) => b.year - a.year)[0];
  const url = new URL(latest.href, page).href;
  const head = await fetch(url, { method: 'HEAD' });
  const size = Number(head.headers.get('content-length'));
  const lastModified = head.headers.get('last-modified');

  const metaPath = join(RAW, 'accountability.meta.json');
  const resultPath = join(RAW, 'accountability.json');
  if (existsSync(metaPath) && existsSync(resultPath)) {
    const prev = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (prev.url === url && prev.size === size) {
      console.log(`  unchanged (${url}, ${size} bytes), keeping the saved result`);
      return;
    }
  }

  const zipPath = join(RAW, `SRC${latest.year}.zip`);
  if (!existsSync(zipPath) || statSync(zipPath).size !== size) {
    console.log(`  downloading ${(size / 1e6).toFixed(0)} MB…`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    await writeFile(zipPath + '.part', res.body);
    execFileSync('mv', [zipPath + '.part', zipPath]);
  }
  const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n');
  const mdbName = listing.find((n) => /\.mdb$/i.test(n)) ?? listing.find((n) => /\.accdb$/i.test(n));
  if (!mdbName) throw new Error('No Access database inside the report card zip');
  console.log(`  extracting ${mdbName}…`);
  execFileSync('unzip', ['-o', '-q', zipPath, mdbName, '-d', RAW]);
  const mdbPath = join(RAW, mdbName);

  const reader = new MDBReader(readFileSync(mdbPath));
  const rows = reader.getTable('Accountability Status').getData({ columns: ['ENTITY_CD', 'ENTITY_NAME', 'YEAR', 'OVERALL_STATUS'] });
  const year = Math.max(...rows.map((r) => Number(r.YEAR)));
  // New York City entity codes start with the county code 30–35.
  const statuses = {};
  for (const r of rows) {
    if (Number(r.YEAR) !== year || !/^3[0-5]/.test(r.ENTITY_CD)) continue;
    statuses[r.ENTITY_CD] = r.OVERALL_STATUS;
  }
  writeFileSync(resultPath, JSON.stringify({ year, database: `SRC${latest.year}`, statuses }));
  writeFileSync(metaPath, JSON.stringify({ url, size, lastModified, year: latest.year, fetched: new Date().toISOString() }));
  console.log(`  ${Object.keys(statuses).length} city entities with a ${year} status; deleting the big files`);
  rmSync(mdbPath, { force: true });
  rmSync(zipPath, { force: true });
}

const only = process.argv.slice(2);
const steps = { directory: fetchDirectory, nces: fetchNces, districts: fetchDistricts, subway: fetchSubway, accountability: fetchAccountability };
const chosen = only.length ? only.map((a) => a.replace(/^--/, '')) : Object.keys(steps);
for (const name of chosen) {
  if (!steps[name]) throw new Error(`Unknown source "${name}". Choose from: ${Object.keys(steps).join(', ')}`);
  await steps[name]();
}
