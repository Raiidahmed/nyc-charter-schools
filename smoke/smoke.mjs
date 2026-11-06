// Browser smoke test: drives real Chrome through every feature at desktop and
// phone sizes, fails on any console error, and saves a screenshot of each step.
//
//   npm run smoke                                   against the dev server
//   SMOKE_URL=http://localhost:4173/nyc-charter-schools/ npm run smoke
//   SMOKE_URL=https://<user>.github.io/nyc-charter-schools/ npm run smoke
//
// The address service and the browser's location are faked so runs repeat.
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from 'puppeteer-core';
import { REVIEWERS_NOTE } from './reviewers-note.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173/nyc-charter-schools/';
const SHOTS = join(HERE, 'screenshots');
const CHROME =
  process.env.CHROME_PATH ??
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

// --- Fakes ------------------------------------------------------------------------
const HOME = { lat: 40.807781, lon: -73.912799, name: '677 EAST 141 STREET', borough: 'Bronx', hood: 'Mott Haven' };
const HERE_NOW = { latitude: 40.8102, longitude: -73.9215, accuracy: 30 };

function geoFeature(name, lat, lon, borough, hood) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: { gid: `fake:${name}`, name, label: `${name}, ${borough}, NY, USA`, borough, neighbourhood: hood },
  };
}

function fakeGeoSearch(url) {
  const u = new URL(url);
  if (u.pathname.endsWith('/autocomplete')) {
    const text = (u.searchParams.get('text') ?? '').toLowerCase();
    const features = text.includes('nowhere')
      ? []
      : [
          geoFeature(HOME.name, HOME.lat, HOME.lon, HOME.borough, HOME.hood),
          geoFeature('677 EAST 140 STREET', 40.8069, -73.9137, 'Bronx', 'Mott Haven'),
          geoFeature('677 ATLANTIC AVENUE', 40.6833, -73.9707, 'Brooklyn', 'Prospect Heights'),
        ];
    return { type: 'FeatureCollection', features };
  }
  return { type: 'FeatureCollection', features: [geoFeature('PLACE', 40.81, -73.92, 'Bronx', 'Mott Haven')] };
}

// --- Harness -----------------------------------------------------------------------
const failures = [];
let shot = 0;
let browser;

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function step(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

async function openPage({ width = 1440, height = 900, mobile = false, path = '' } = {}) {
  const context = await browser.createBrowserContext();
  await context.overridePermissions(new URL(BASE).origin, ['geolocation']);
  const page = await context.newPage();
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  await page.setGeolocation(HERE_NOW);
  page.errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(m.text());
  });
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.isInterceptResolutionHandled()) return;
    if (req.url().startsWith('https://geosearch.planninglabs.nyc/')) {
      req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fakeGeoSearch(req.url())) });
    } else req.continue();
  });
  await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => window.charterMap !== undefined, { timeout: 30000 });
  await idle(page);
  return page;
}

async function idle(page, extra = 150) {
  await page.waitForFunction(() => !window.charterMap?.moving(), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, extra));
  await page.waitForFunction(() => !window.charterMap?.moving(), { timeout: 15000 });
}

async function snap(page, name) {
  shot++;
  await page.screenshot({ path: join(SHOTS, `${String(shot).padStart(2, '0')}-${name}.png`) });
}

async function noErrors(page) {
  check(page.errors.length === 0, `console errors: ${page.errors.join(' | ')}`);
}

/** Clicks the first visible element matching a selector whose text includes `text`. */
async function clickText(page, selector, text) {
  const ok = await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.replace(/\s+/g, ' ').trim().includes(t) && e.getClientRects().length > 0);
      if (!el) return false;
      el.click();
      return true;
    },
    selector,
    text,
  );
  check(ok, `no "${text}" in ${selector}`);
  await new Promise((r) => setTimeout(r, 120));
}

const text = (page, sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
const exists = (page, sel) => page.$(sel).then((h) => h !== null);
const visible = (page, sel) => page.$eval(sel, (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden').catch(() => false);
const search = (page) => page.evaluate(() => window.location.search);
const zoom = (page) => page.evaluate(() => window.charterMap.zoom());
const markerPos = (page) =>
  page.$eval('.home-marker', (e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.bottom };
  });

async function typeInto(page, sel, value) {
  await page.click(sel, { count: 3 });
  await page.keyboard.press('Backspace');
  await page.type(sel, value, { delay: 15 });
}

function assertNoHomeInUrl(qs) {
  check(!/home|address|lat|lon|miles|commute|district|mode/i.test(qs), `link carries personal data: ${qs}`);
  check(!/sort=(distance|commute)/.test(qs), `link carries a home-based sort: ${qs}`);
}

async function setHomeByAddress(page) {
  if (await exists(page, '.home-address')) await page.click('.home-address');
  await typeInto(page, '.topbar .home-input, .phone-top .home-input', '677 E 141');
  await page.waitForSelector('.suggestion', { visible: true });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.home-marker');
  await idle(page);
}

// --- Desktop -------------------------------------------------------------------------
async function desktop() {
  console.log('Desktop, 1440 × 900');
  const page = await openPage();

  await step('starts with the list hidden and the top bar on one line', async () => {
    check(!(await exists(page, '.panel')), 'panel is open at start');
    check(await visible(page, '.show-list'), 'no Show list button');
    const h = await page.$eval('.topbar-row', (e) => e.getBoundingClientRect().height);
    check(h <= 40, `top row is ${h}px tall, so it wrapped`);
    check(await exists(page, '.topbar-second .search'), 'search box is not on the second line');
    check(await exists(page, '.topbar-second .filter-menus'), 'filter buttons are not on the second line');
    await snap(page, 'start');
    await noErrors(page);
  });

  await step('top line stays on one line at 1410 px, and nothing spills out when narrower', async () => {
    await page.setViewport({ width: 1410, height: 900 });
    await new Promise((r) => setTimeout(r, 300));
    const h = await page.$eval('.topbar-row', (e) => e.getBoundingClientRect().height);
    check(h <= 40, `top row wrapped at 1410 px (${h}px)`);
    await page.setViewport({ width: 900, height: 900 });
    await new Promise((r) => setTimeout(r, 300));
    const spill = await page.$eval('.topbar', (bar) => {
      const right = bar.getBoundingClientRect().right;
      return [...bar.querySelectorAll('.topbar-row > *, .topbar-second > *, .filter-button')].filter((e) => e.getBoundingClientRect().right > right + 0.5).map((e) => e.className);
    });
    check(spill.length === 0, `spills past the top bar at 900 px: ${spill.join(', ')}`);
    await snap(page, 'narrow-900');
    await page.setViewport({ width: 1440, height: 900 });
    await idle(page, 400);
  });

  await step('Show list opens the panel with an in-view count', async () => {
    await page.click('.show-list');
    await page.waitForSelector('.panel .list-title');
    const h = await text(page, '.list-title');
    check(/^(280 schools|\d+ of 280 schools in view)$/.test(h), `heading was "${h}"`);
    await snap(page, 'list-open');
    await page.click('.list-header .icon-button');
    await page.waitForSelector('.show-list');
  });

  await step('search: typing filters without moving the map, Enter frames, Escape clears', async () => {
    const z0 = await zoom(page);
    await page.type('.search-input', 'kipp', { delay: 20 });
    await page.waitForSelector('.panel .list-title');
    await new Promise((r) => setTimeout(r, 300));
    const h = await text(page, '.list-title');
    check(h === '9 schools match “kipp”', `heading was "${h}"`);
    check(Math.abs((await zoom(page)) - z0) < 1e-6, 'map moved while typing');
    check((await search(page)).includes('q=kipp'), 'search not in link');
    await page.keyboard.press('Enter');
    await idle(page, 300);
    check((await zoom(page)) > z0 + 0.3, 'Enter did not frame the matches');
    await snap(page, 'search-kipp-enter');
    const z1 = await zoom(page);
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 300));
    check((await page.$eval('.search-input', (e) => e.value)) === '', 'Escape did not clear');
    check(Math.abs((await zoom(page)) - z1) < 1e-6, 'map moved on Escape');
    const h2 = await text(page, '.list-title');
    check(/schools( in view)?$/.test(h2), `list did not go back to in view: "${h2}"`);
  });

  await step('search: one match opens directly; × clears and the school stays open', async () => {
    await typeInto(page, '.search-input', 'icahn charter school 7');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.details-name');
    check((await text(page, '.details-name')) === 'Icahn Charter School 7', 'wrong school opened');
    await idle(page, 300);
    await snap(page, 'one-match-opens');
    await page.click('.search .icon-button');
    await new Promise((r) => setTimeout(r, 200));
    check((await page.$eval('.search-input', (e) => e.value)) === '', '× did not clear');
    check(await exists(page, '.details-name'), 'school closed when the search cleared');
  });

  await step('Escape in the search box does not close the open school; Escape after does', async () => {
    await page.type('.search-input', 'success', { delay: 10 });
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 200));
    check(await exists(page, '.details-name'), 'Escape in search closed the school');
    await page.$eval('.search-input', (e) => e.blur());
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 200));
    check(!(await exists(page, '.details-name')), 'Escape did not close the school');
  });

  await step('home by address: suggestions work from the keyboard and never reach the link', async () => {
    await setHomeByAddress(page);
    const label = await text(page, '.home-address');
    check(label.includes('677 East 141st Street, Bronx') || label.includes('677 East 141 Street, Bronx'), `label was "${label}"`);
    check(label.includes('District 7'), 'no district shown');
    const sort = await page.$eval('.sort select', (e) => e.value).catch(() => null);
    check(sort === null || sort === 'distance', `sort did not switch to closest first (${sort})`);
    assertNoHomeInUrl(await search(page));
    await snap(page, 'home-address');
  });

  await step('opening and closing the list leaves the home marker on the same pixel', async () => {
    if (await exists(page, '.panel')) {
      await page.click('.list-header .icon-button');
      await idle(page);
    }
    const a = await markerPos(page);
    await page.click('.show-list');
    await page.waitForSelector('.panel');
    await idle(page, 300);
    const b = await markerPos(page);
    await page.click('.list-header .icon-button');
    await idle(page, 300);
    const c = await markerPos(page);
    check(Math.hypot(a.x - b.x, a.y - b.y) < 1 && Math.hypot(a.x - c.x, a.y - c.y) < 1, `marker moved: ${JSON.stringify([a, b, c])}`);
  });

  await step('both zoom buttons work', async () => {
    await page.click('[aria-label="Zoom to every matching school"]');
    await idle(page, 300);
    const zAll = await zoom(page);
    await page.click('[aria-label="Zoom to your home"]');
    await idle(page, 300);
    const zHome = await zoom(page);
    check(zHome > zAll + 1, `zoom to home did not zoom in (${zAll} → ${zHome})`);
    const m = await markerPos(page);
    check(Math.abs(m.x - 720) < 40, `home not centered (x=${m.x})`);
    await snap(page, 'zoom-home');
    await page.click('[aria-label="Zoom to every matching school"]');
    await idle(page, 300);
  });

  await step('selecting a visible school keeps it within a few pixels while zooming in', async () => {
    await typeInto(page, '.search-input', 'academic leadership');
    await idle(page, 400);
    const s = await page.evaluate(async () => {
      const list = await (await fetch('data/schools.json')).json();
      return list.find((x) => x.name === 'Academic Leadership Charter School');
    });
    const before = await page.evaluate((x) => window.charterMap.project(x.lat, x.lon), s);
    const z0 = await zoom(page);
    await page.mouse.click(before.x, before.y);
    await page.waitForSelector('.details-name');
    await idle(page, 300);
    const after = await page.evaluate((x) => window.charterMap.project(x.lat, x.lon), s);
    check((await zoom(page)) > z0 + 0.5, 'map did not zoom in');
    check(Math.hypot(after.x - before.x, after.y - before.y) < 4, `school moved ${Math.hypot(after.x - before.x, after.y - before.y).toFixed(1)}px`);
    await snap(page, 'select-stays-put');
  });

  await step('the school details show every section', async () => {
    const body = await text(page, '.details');
    for (const part of ['Back to list', 'Grades', 'Enrollment', 'Student–teacher ratio', 'Address', 'District 7', 'Opened', 'Authorizer', 'State rating', 'Phone', 'Nearby subway', 'Directions', 'State school profile', 'Federal profile'])
      check(body.includes(part), `details missing "${part}"`);
    await page.click('.info-button');
    check(await visible(page, '.info-text'), 'authorizer ⓘ did not open');
    check(body.includes('In your district'), 'no In your district badge');
  });

  await step('Back to list returns to the list with the school highlighted and in view', async () => {
    await page.click('.search .icon-button');
    await new Promise((r) => setTimeout(r, 300));
    await page.click('.back');
    await page.waitForSelector('.row-recent');
    const inView = await page.$eval('.row-recent', (row) => {
      const box = row.closest('.list-scroll').getBoundingClientRect();
      const r = row.getBoundingClientRect();
      return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    });
    check(inView, 'highlighted row not in view');
    await snap(page, 'back-to-list');
  });

  await step('a school dragged behind the panel is brought back into view', async () => {
    const id = await page.$eval('.row-recent', (e) => e.dataset.id);
    const s = await page.evaluate(async (want) => (await (await fetch('data/schools.json')).json()).find((x) => x.id === want), id);
    let p = await page.evaluate((x) => window.charterMap.project(x.lat, x.lon), s);
    const panelLeft = await page.$eval('.panel', (e) => e.getBoundingClientRect().left);
    const dx = panelLeft + 150 - p.x;
    await page.mouse.move(600, 500);
    await page.mouse.down();
    await page.mouse.move(600 + dx / 2, 500, { steps: 8 });
    await page.mouse.move(600 + dx, 500, { steps: 8 });
    await page.mouse.up();
    await idle(page, 300);
    p = await page.evaluate((x) => window.charterMap.project(x.lat, x.lon), s);
    check(p.x > panelLeft, `school not behind the panel after the drag (x=${p.x})`);
    // It's covered, so it leaves the in-view list; search finds it anywhere.
    await typeInto(page, '.search-input', s.name);
    await page.click(`.row[data-id="${s.id}"]`);
    await page.waitForSelector('.details-name');
    await idle(page, 400);
    p = await page.evaluate((x) => window.charterMap.project(x.lat, x.lon), s);
    const left = await page.$eval('.panel', (e) => e.getBoundingClientRect().left);
    check(p.x < left - 10 && p.x > 10, `school still covered (x=${p.x}, panel at ${left})`);
    await snap(page, 'brought-into-view');
    await page.click('.search .icon-button');
    await page.click('.details-bar .icon-button');
  });

  await step('× on a school opened from the map returns to no panel when the list was hidden', async () => {
    await page.click('.list-header .icon-button');
    await idle(page);
    await page.evaluate(() => window.history.replaceState(null, '', window.location.pathname));
    await typeInto(page, '.search-input', 'academic leadership');
    await page.click('.list-header .icon-button');
    await idle(page, 300);
    const s = await page.evaluate(async () => (await (await fetch('data/schools.json')).json()).find((x) => x.name === 'Academic Leadership Charter School'));
    const p = await page.evaluate((x) => window.charterMap.project(x.lat, x.lon), s);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('.details-name');
    await page.click('.details-bar .icon-button');
    await new Promise((r) => setTimeout(r, 300));
    check(!(await exists(page, '.panel')), 'panel still open after ×');
    await page.click('.search .icon-button');
  });

  await step('home by location, labeled with its neighborhood; outside the city is refused', async () => {
    await page.click('.home-address');
    await page.click('[aria-label="Use my location"]');
    await page.waitForFunction(() => document.querySelector('.home-label')?.textContent.startsWith('Current location · Mott Haven'), { timeout: 8000 });
    await page.setGeolocation({ latitude: 40.7357, longitude: -74.1724, accuracy: 30 });
    await page.click('.home-address');
    await page.click('[aria-label="Use my location"]');
    await page.waitForSelector('.banner.warn');
    check((await text(page, '.banner.warn')).includes('outside New York City'), 'no outside-city notice');
    await page.click('[aria-label="Keep the current home"]');
    check((await text(page, '.home-label')).startsWith('Current location'), 'home changed to an outside spot');
    await page.click('.banner.warn .icon-button');
    await page.setGeolocation(HERE_NOW);
    await idle(page);
    await snap(page, 'home-location');
  });

  await step('home by pin: banner, Escape cancels, a click sets it', async () => {
    await page.click('.home-address');
    await page.click('[aria-label="Drop a pin on the map"]');
    await page.waitForSelector('.banner');
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 200));
    check(!(await exists(page, '.banner')), 'Escape did not cancel the pin');
    await page.click('[aria-label="Drop a pin on the map"]');
    await page.waitForSelector('.banner');
    await snap(page, 'pin-banner');
    const near = await markerPos(page);
    await page.mouse.click(near.x - 70, near.y + 40);
    await page.waitForFunction(() => document.querySelector('.home-label')?.textContent.startsWith('Dropped pin · Mott Haven'), { timeout: 8000 });
    assertNoHomeInUrl(await search(page));
    await idle(page);
  });

  await step('distance, district and commute filters work and stay out of links', async () => {
    await clickText(page, '.filter-button', 'Location');
    await clickText(page, '.dropdown .option', 'Within 1 mi');
    await clickText(page, '.dropdown .option', 'Only schools in my district');
    const chips = await page.$$eval('.topbar .chip', (els) => els.map((e) => e.textContent.trim()));
    check(chips.includes('Within 1 mi') && chips.includes('In my district (District 7)'), `chips were ${chips.join(', ')}`);
    const hasTravel = await page.evaluate(() => fetch('data/travel/index.json').then((r) => r.ok && r.headers.get('content-type')?.includes('json')));
    if (hasTravel) {
      await page.waitForFunction(() => [...document.querySelectorAll('.dropdown .option')].some((b) => b.textContent.includes('30 min or less') && !b.disabled), { timeout: 10000 });
      await clickText(page, '.dropdown .option', '30 min or less');
      await clickText(page, '.dropdown .segment', 'By car');
      const c2 = await page.$$eval('.topbar .chip', (els) => els.map((e) => e.textContent.trim()));
      check(c2.includes('≤ 30 min by car at rush hour'), `no rush-hour chip: ${c2.join(', ')}`);
      await clickText(page, '.dropdown .segment', 'Transit');
      check((await page.$$eval('.topbar .chip', (els) => els.map((e) => e.textContent.trim()))).includes('≤ 30 min by transit'), 'no transit chip');
    } else console.log('      (no commute data yet: commute options hidden, skipped)');
    await snap(page, 'location-filters');
    assertNoHomeInUrl(await search(page));
    await clickText(page, '.dropdown .button', 'Show');
    await idle(page);
    if (hasTravel) {
      await page.waitForSelector('.row-trip');
      check((await text(page, '.row-trip')).includes('by transit'), 'rows show no commute');
      await page.click('.row');
      await page.waitForSelector('.commutes');
      const commute = await text(page, '.commutes');
      check(/rush hour/.test(commute) || /More than/.test(commute), 'details show no car estimate');
      await snap(page, 'commute-details');
      await page.click('.details-bar .icon-button');
    }
    await page.click('.topbar .chip-clear');
  });

  await step('subway filters and layer', async () => {
    await page.click('.subway-toggle');
    check((await page.$eval('.subway-toggle', (e) => e.getAttribute('aria-pressed'))) === 'true', 'toggle not pressed');
    await page.click('.subway-toggle');
    check((await page.$eval('.subway-toggle', (e) => e.getAttribute('aria-pressed'))) === 'false', 'toggle did not turn off');
    await clickText(page, '.filter-button', 'Location');
    await page.click('.line-option:has([aria-label="A train"])');
    check((await page.$eval('.subway-toggle', (e) => e.getAttribute('aria-pressed'))) === 'true', 'picking a line did not turn on the subway layer');
    await clickText(page, '.dropdown .option', '10 min or less');
    await clickText(page, '.dropdown .option', 'Accessible stations only');
    const qs = await search(page);
    check(qs.includes('lines=A') && qs.includes('walk=10') && qs.includes('accessible=1'), `link was ${qs}`);
    await idle(page, 600);
    await snap(page, 'subway');
    await clickText(page, '.dropdown .button', 'Clear all');
    await page.keyboard.press('Escape');
  });

  await step('state rating filter finds 12 schools at the comprehensive level', async () => {
    await clickText(page, '.filter-button', 'Oversight');
    const labels = await page.$$eval('.dropdown .option', (els) => els.map((e) => e.textContent.trim()));
    check(!labels.some((l) => l.startsWith('Additional targeted')), 'offers a level no school has');
    await clickText(page, '.dropdown .option', 'Comprehensive support');
    const btn = await text(page, '.dropdown .button.primary');
    check(btn === 'Show 12 schools', `button said "${btn}"`);
    await snap(page, 'rating-filter');
    await clickText(page, '.dropdown .button', 'Clear all');
    await page.keyboard.press('Escape');
  });

  await step('grades and profile filters and links round-trip', async () => {
    await clickText(page, '.filter-button', 'Grades');
    await clickText(page, '.dropdown .option', 'Middle');
    await page.select('.dropdown select', '6');
    await clickText(page, '.dropdown .option', 'Offers Pre-K');
    await page.keyboard.press('Escape');
    await clickText(page, '.filter-button', 'School profile');
    await clickText(page, '.dropdown .option', 'Large');
    await page.select('.dropdown select', 'Success Academy');
    await page.keyboard.press('Escape');
    const qs = await search(page);
    check(qs.includes('level=middle') && qs.includes('entering=6') && qs.includes('prek=1') && qs.includes('size=large') && qs.includes('network=Success+Academy'), `link was ${qs}`);
    const chips = await page.$$eval('.topbar .chip', (els) => els.length);
    check(chips === 5, `expected 5 chips, saw ${chips}`);
    const p2 = await openPage({ path: qs });
    const qs2 = await search(p2);
    check(qs2 === qs, `link did not round-trip: ${qs} → ${qs2}`);
    await p2.close();
    await page.click('.topbar .chip-clear');
  });

  await step('parent runs the guide, which clears the view and frames the results', async () => {
    // Start somewhere unhelpful: searching, a school open, zoomed in far away.
    await typeInto(page, '.search-input', 'hellenic classical staten');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.details-name');
    await idle(page, 400);
    const zBefore = await zoom(page);
    await page.click('.get-started');
    await page.waitForSelector('dialog[open] .choice.role');
    await snap(page, 'guide-roles');
    await clickText(page, 'dialog .choice', 'Parent or guardian');
    await clickText(page, 'dialog .choice', 'Kindergarten');
    await page.waitForSelector('dialog .home-control');
    await clickText(page, 'dialog .button', 'Next');
    await clickText(page, 'dialog .choice', 'Subway or bus');
    await clickText(page, 'dialog .choice', 'Up to 45 minutes');
    await clickText(page, 'dialog .choice', 'A smaller school');
    await clickText(page, 'dialog .choice', 'Schools in our district');
    await snap(page, 'guide-priorities');
    await clickText(page, 'dialog .button', 'Next');
    await page.waitForFunction(() => document.querySelector('dialog .guide-question')?.textContent.startsWith('We found'));
    const body = await text(page, 'dialog[open]');
    check(body.includes('Entering kindergarten') && body.includes('In my district (District 7)'), 'chips missing');
    check(body.includes('April 1') && body.includes('common online application'), 'no admissions basics');
    await snap(page, 'guide-parent-done');
    await clickText(page, 'dialog .button.primary', 'Show');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await idle(page, 400);
    check(await exists(page, '.panel .list-title'), 'list not open behind the guide');
    check(!(await exists(page, '.details-name')), 'a school was still open after the guide');
    check((await page.$eval('.search-input', (e) => e.value)) === '', 'search not cleared');
    const n = Number(body.match(/We found (\d+)/)[1]);
    const heading = await text(page, '.list-title');
    check(heading === `${n} schools`, `not every match in view after the guide: "${heading}"`);
    check((await zoom(page)) < zBefore, 'map did not zoom out to the results');
    const sort = await page.$eval('.sort select', (e) => e.value);
    check(['commute', 'distance'].includes(sort), `sort was ${sort}`);
    await snap(page, 'guide-parent-framed');
    await page.click('.topbar .chip-clear');
  });

  await step('researcher runs the guide', async () => {
    await page.click('.get-started');
    await clickText(page, 'dialog .choice', 'Researcher or just exploring');
    await clickText(page, 'dialog .choice', 'Queens');
    await clickText(page, 'dialog .button', 'Next');
    await clickText(page, 'dialog .choice', 'Success Academy');
    await page.waitForFunction(() => document.querySelector('dialog .guide-question')?.textContent.startsWith('We found'));
    const body = await text(page, 'dialog[open]');
    check(body.includes('Queens') && body.includes('Success Academy') && body.includes('data notes'), 'researcher result incomplete');
    await snap(page, 'guide-researcher-done');
    const found = Number(body.match(/We found (\d+)/)[1]);
    await clickText(page, 'dialog .button.primary', 'Show');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await idle(page, 400);
    const heading = await text(page, '.list-title');
    check(heading === `${found} schools`, `not every match in view after the guide: "${heading}"`);
    check((await search(page)).includes('borough=queens'), 'guide filters not applied');
    await page.click('.topbar .chip-clear');
  });

  await step('reviewers’ note matches the text, in order, and closes', async () => {
    await page.click('.reviewers-open');
    await page.waitForSelector('dialog[open] .note-section');
    const got = await page.$eval('dialog[open]', (d) => ({
      title: d.querySelector('.dialog-title').textContent.trim(),
      headings: [...d.querySelectorAll('.note-section h3')].map((h) => h.textContent.trim()),
      steps: d.querySelectorAll('.note-section ol > li').length,
      text: [...d.querySelectorAll('.note-section')].slice(0, 3).map((s) => [...s.children].map((c) => (c.tagName === 'UL' || c.tagName === 'OL' ? [...c.children].map((li) => li.textContent.trim()).join('\n') : c.textContent.replace(/\s+/g, ' ').trim())).join('\n')).join('\n'),
    }));
    check(got.title === REVIEWERS_NOTE.title, `title was "${got.title}"`);
    check(JSON.stringify(got.headings.slice(0, 3)) === JSON.stringify(REVIEWERS_NOTE.headings), `headings were ${got.headings.join(' / ')}`);
    check(got.steps === 5, `${got.steps} build steps`);
    check(got.text === REVIEWERS_NOTE.body, `text differs:\n${diff(got.text, REVIEWERS_NOTE.body)}`);
    await snap(page, 'reviewers-note');
    await page.click('dialog[open] .assumptions summary');
    await snap(page, 'reviewers-assumptions');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await page.click('.reviewers-close');
    check(!(await exists(page, '.reviewers-open')), 'reviewers button still showing');
    await page.click('.methods');
    await page.waitForSelector('dialog[open] .note-section');
    await page.keyboard.press('Escape');
  });

  await step('clearing the home removes the home-based filters and sorts', async () => {
    await clickText(page, '.filter-button', 'Location');
    await clickText(page, '.dropdown .option', 'Within 2 mi');
    await page.keyboard.press('Escape');
    if (!(await exists(page, '.panel'))) await page.click('.show-list');
    await page.select('.sort select', 'distance');
    check((await page.$$eval('.topbar .chip', (els) => els.map((e) => e.textContent.trim()))).includes('Within 2 mi'), 'no distance chip');
    await page.click('[aria-label="Clear your home"]');
    await new Promise((r) => setTimeout(r, 200));
    check(!(await exists(page, '.topbar .chip')), 'home-based chip left behind');
    check((await page.$eval('.sort select', (e) => e.value)) === 'name', 'sort did not switch back to name');
    await setHomeByAddress(page);
    check(!(await exists(page, '.topbar .chip')), 'the old distance filter came back');
  });

  await step('no console errors on desktop', () => noErrors(page));
  await page.close();
}

function diff(a, b) {
  const al = a.split('\n');
  const bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i++) if (al[i] !== bl[i]) return `  got:      ${al[i]}\n  expected: ${bl[i]}`;
  return '';
}

async function links() {
  console.log('Links');
  await step('old links open cleanly and drop layout and view settings', async () => {
    const page = await openPage({ path: '?layout=table&view=list&zoom=12&center=40.7,-74&q=kipp&borough=bronx&sort=bogus' });
    check((await search(page)) === '?q=kipp&borough=bronx', `link became ${await search(page)}`);
    check(await exists(page, '.panel .list-title'), 'a link with a search did not open the list');
    await snap(page, 'old-link');
    await noErrors(page);
    await page.close();
  });

  await step('a link to a school opens directly on it', async () => {
    const page = await openPage({ path: '?school=320700860957' });
    check((await text(page, '.details-name')) === 'Academic Leadership Charter School', 'school not open');
    check((await zoom(page)) >= 14.5, 'map not on the school');
    await snap(page, 'school-link');
    await noErrors(page);
    await page.close();
  });
}

// --- Phone ------------------------------------------------------------------------------
async function phone() {
  console.log('Phone, 390 × 844');
  const page = await openPage({ width: 390, height: 844, mobile: true });

  await step('phone layout: top section, list hidden, Show list opens the sheet', async () => {
    check(await exists(page, '.phone-top'), 'no phone layout');
    check(!(await exists(page, '.sheet.list-sheet.open')), 'list open at start');
    await snap(page, 'phone-start');
    await page.click('.phone-show-list');
    await page.waitForSelector('.list-sheet.open');
    await new Promise((r) => setTimeout(r, 400));
    await snap(page, 'phone-list');
  });

  await step('phone: details sheet keeps its close button visible while scrolling', async () => {
    await page.click('.list-sheet .row');
    await page.waitForSelector('.details-sheet.open .details-name');
    await new Promise((r) => setTimeout(r, 400));
    await page.$eval('.details-sheet .details', (e) => e.scrollTo(0, e.scrollHeight));
    await new Promise((r) => setTimeout(r, 200));
    const ok = await page.$eval('.details-sheet', (sheet) => {
      const s = sheet.getBoundingClientRect();
      const b = sheet.querySelector('.details-bar .icon-button').getBoundingClientRect();
      return b.top >= s.top && b.top < s.top + 60;
    });
    check(ok, 'close button scrolled away');
    await snap(page, 'phone-details-scrolled');
    await page.click('.details-sheet .details-bar .icon-button');
  });

  await step('phone: Back to list and reopening the list leave the page in place', async () => {
    const shifted = () =>
      page.evaluate(() => ({
        frames: [...document.querySelectorAll('.app, .sheet, body, html')].filter((e) => e.scrollTop !== 0).map((e) => e.className || e.tagName),
        top: Math.round(document.querySelector('.phone-top').getBoundingClientRect().top),
      }));
    await page.tap('[aria-label="Zoom to every matching school"]');
    await idle(page, 300);
    if (!(await exists(page, '.list-sheet.open'))) await page.tap('.phone-show-list');
    await page.waitForSelector('.list-sheet.open');
    await page.waitForFunction(() => document.querySelectorAll('.list-sheet .row').length >= 8);
    await page.$eval('.list-sheet .list-scroll', (e) => e.scrollTo(0, 400));
    await page.tap('.list-sheet li:nth-child(8) .row');
    await page.waitForSelector('.details-sheet.open .details-name');
    await new Promise((r) => setTimeout(r, 400));
    await page.tap('.details-sheet .back');
    await page.waitForSelector('.list-sheet.open .row-recent');
    await new Promise((r) => setTimeout(r, 400));
    let s = await shifted();
    check(s.frames.length === 0 && s.top === 8, `page moved after Back to list: ${JSON.stringify(s)}`);
    const rowInView = await page.$eval('.list-sheet .row-recent', (row) => {
      const box = row.closest('.list-scroll').getBoundingClientRect();
      const r = row.getBoundingClientRect();
      return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    });
    check(rowInView, 'the school just viewed is not in view in the list');
    await snap(page, 'phone-back-to-list');
    await page.tap('.list-sheet .list-header .icon-button');
    await new Promise((r) => setTimeout(r, 400));
    await page.tap('.phone-show-list');
    await page.waitForSelector('.list-sheet.open');
    await new Promise((r) => setTimeout(r, 400));
    s = await shifted();
    check(s.frames.length === 0 && s.top === 8, `page moved after reopening the list: ${JSON.stringify(s)}`);
    await page.tap('.list-sheet .list-header .icon-button');
  });

  await step('phone: search with Enter puts the keyboard away', async () => {
    await page.type('.search-input', 'kipp');
    await page.keyboard.press('Enter');
    await new Promise((r) => setTimeout(r, 300));
    const focused = await page.evaluate(() => document.activeElement?.classList.contains('search-input'));
    check(!focused, 'search box still focused');
    await idle(page, 300);
    await snap(page, 'phone-search');
    await page.click('.search .icon-button');
  });

  await step('phone: Filters opens every group full screen', async () => {
    await page.click('.filters-open');
    await page.waitForSelector('dialog[open] .filters-section');
    const n = await page.$$eval('dialog[open] .filters-section', (els) => els.length);
    check(n === 4, `${n} groups`);
    const w = await page.$eval('dialog[open]', (d) => d.getBoundingClientRect().width);
    check(w >= 389, `dialog is ${w}px wide`);
    await snap(page, 'phone-filters');
    await clickText(page, 'dialog .button.primary', 'Show');
  });

  await step('student runs the guide on a phone', async () => {
    if (await exists(page, '.list-sheet.open')) await page.click('.list-sheet .list-header .icon-button');
    await page.click('.get-started');
    await page.waitForSelector('dialog[open] .choice.role');
    const w = await page.$eval('dialog[open]', (d) => d.getBoundingClientRect().width);
    check(w >= 389, 'guide is not full screen');
    await clickText(page, 'dialog .choice', 'Student');
    await clickText(page, 'dialog .choice', '9th grade');
    await clickText(page, 'dialog .button', 'Skip');
    await clickText(page, 'dialog .choice', 'A fresh start or catching up on credits');
    await snap(page, 'phone-guide-student');
    await clickText(page, 'dialog .button', 'Next');
    await page.waitForFunction(() => document.querySelector('dialog .guide-question')?.textContent.startsWith('We found'));
    const body = await text(page, 'dialog[open]');
    check(body.includes('Transfer schools') && body.includes('Entering 9th grade'), 'student chips missing');
    await snap(page, 'phone-guide-done');
    const found = Number(body.match(/We found (\d+)/)[1]);
    await clickText(page, 'dialog .button.primary', 'Show');
    await page.waitForSelector('.list-sheet.open');
    await idle(page, 500);
    const heading = await text(page, '.list-sheet .list-title');
    check(heading === `${found} schools`, `not every match in view after the guide: "${heading}"`);
    await snap(page, 'phone-guide-framed');
  });

  await step('phone: home by address works the same', async () => {
    await setHomeByAddress(page);
    check((await text(page, '.home-address')).includes('District 7'), 'no district');
    assertNoHomeInUrl(await search(page));
    await snap(page, 'phone-home');
  });

  await step('no console errors on the phone', () => noErrors(page));
  await page.close();
}

// --- Run ----------------------------------------------------------------------------------
if (!CHROME) {
  console.error('Chrome not found. Set CHROME_PATH.');
  process.exit(1);
}
console.log(`Smoke test against ${BASE}`);
browser = await launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--window-size=1440,900'] });
try {
  await desktop();
  await links();
  await phone();
} finally {
  await browser.close();
}
console.log(`\nScreenshots in smoke/screenshots (${shot}).`);
if (failures.length) {
  console.error(`\n${failures.length} failed:\n${failures.map((f) => `  - ${f.split('\n')[0]}`).join('\n')}`);
  process.exit(1);
}
console.log('All smoke checks passed.');
