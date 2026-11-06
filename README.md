# NYC Charter Schools Map

**Live site:** https://raiidahmed.github.io/nyc-charter-schools/

New York City has about 280 charter schools, and the facts a family needs to choose between them are scattered. The state keeps the official list, the federal government keeps addresses and enrollment, and the MTA keeps the subway. This project pulls it together into one map. Anyone can filter by grade, location and school characteristics, type in their home address to see estimated commute times, and narrow 280 options down to a short list. It describes schools and never ranks them.

It's for four kinds of people: a student or a parent choosing a school, a teacher or job seeker looking for somewhere to work, and a researcher or anyone using the map as a database of the city's charters. Each is asking the same question: which schools fit my daily life? That comes down to getting there (commute, distance and the subway), the school itself (grades, size, student–teacher ratio, network and authorizer) and getting in (charter lotteries favor students from the school's own district).

## Ground rules

- No demographics, test scores, rankings or specialty tags. The one performance-related fact is New York's official accountability status, shown as a support level rather than a grade.
- Your home address is private. It never appears in a link you share, and neither do the filters that depend on it (distance, district and commute). It lives in memory unless you tick "Remember my address on this device", which keeps it in the browser's local storage.
- Commute times are estimates, computed ahead of time and always labeled as estimates. The site calls no routing service when you use it.
- There is no server: it's a static site on GitHub Pages, with one desktop layout and one phone layout.
- The map never jumps. Opening and closing panels leaves it exactly where it is, and selecting a school moves it gently.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Runs the site at http://localhost:5173/nyc-charter-schools/ |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | Code checks (oxlint) |
| `npm run build` / `npm run preview` | Production build, and serving it locally at http://localhost:4173/nyc-charter-schools/ |
| `npm run data` | Downloads the sources, builds the data files and checks them |
| `npm run data:fetch -- --accountability` | Refreshes just the state rating |
| `npm run travel:setup` then `npm run travel` | Installs the routing toolchain, then computes commute times (about an hour) |
| `npm run smoke` | Browser smoke test against whichever server is running (set `SMOKE_URL` for another one) |

Node 24 or newer. The travel scripts need Python 3.10+, `curl` and `unzip`; they install Java 21 themselves.

## How it's built

React and TypeScript, built with Vite. The map is [MapLibre](https://maplibre.org/) through react-map-gl, on [OpenFreeMap](https://openfreemap.org/)'s Positron base map. Styling is plain CSS in a handful of files by area (`src/styles`), with no framework.

```
src/
  lib/        the rules, as small plain modules with unit tests:
              filters, sorting, search, links, grades, distances, travel lookup, the guide
  state/      one provider holding all shared state, read with useExplorer()
  map/        the map and its calm camera
  components/ the top bar pieces, filter groups, results panel, guide and notes
  layouts/    the desktop and phone arrangements; they hold no logic
scripts/
  data/       Node scripts that fetch, build and check the data
  travel/     Python scripts (r5py) that compute commute times
smoke/        the browser smoke test
public/data/  the finished data files the site loads
```

Two setup details: MapLibre loads a worker script that Vite's bundling breaks, so the app points it at the file explicitly (`setWorkerUrl` with a `?url` import). And the map library gets its own chunk, so it stays cached between releases.

### Keeping the map calm

MapLibre's padding tells it which parts of the screen are covered, so it can center things in the visible area, but changing the padding normally makes the whole map jump sideways. So every time a panel opens or closes, the camera (`src/map/camera.ts`) works out the center that leaves everything on screen where it is, and applies the new padding and that center together. If the map is mid-animation it waits for the animation to finish first, because starting any jump cancels it. Selecting a school zooms in up to three levels over most of a second, around the school if it's visible, or bringing it to the middle if it's covered. Every other move is short and straight (`linear: true`), and nothing is ever undone after you move the map yourself. With reduced motion on, the map doesn't animate.

## The data

All the data is prepared ahead of time. Raw downloads go in `data/raw` (not committed); the finished files go in `public/data`.

| Source | What it provides |
| --- | --- |
| [NYSED charter school directory](https://www.nysed.gov/charter-schools/charter-schools-directory) | The definitive list of current charters: state code (the school ID), authorizer, year opened, district. Its file name carries an as-of date. |
| [NCES EDGE public school data](https://nces.ed.gov/programs/edge/Geographic/SchoolLocations), queried from its map service | Location, street address, phone, grades served, enrollment, student–teacher ratio and school type. Joined on the state code. |
| [NYC Open Data school districts](https://data.cityofnewyork.us/d/8ugf-3d8u) | District outlines, simplified on the server. |
| MTA [station complexes](https://data.ny.gov/d/5f5g-n3cz), [entrances](https://data.ny.gov/d/i9wp-a4ja) and [line shapes](https://data.ny.gov/d/s692-irgq) | Nearby stations, measured to the nearest entrance; the subway layer. |
| [NYS report card database](https://data.nysed.gov/downloads.php) | Each school's accountability status. A 390 MB zip holding a 1.6 GB Access database: the script checks the file size first, only downloads a new edition, reads one table, keeps a small result and deletes the big file. |

The state's static website serves an incomplete certificate chain, so `scripts/data/certs` ships the missing GlobalSign intermediate and the fetch script trusts it.

**Building the records** (`scripts/data/build.mjs`). Start from the state's list of city charters and match each to its federal record. Federal records that match nothing are probably closed or merged schools and are set aside. Schools with no federal location go under "Not on the map yet": "New school" if they opened in 2025 or later, otherwise "No location record". Networks come from a short hand-written list of name patterns (`scripts/data/networks.mjs`); anything else is independent. Federal "regular" schools are general, "special education" stays, and "alternative" schools are transfer schools. Districts come from the outline that contains the school, falling back to the state's listing. Each school gets up to four stations within three quarters of a mile, nearest first, with lines, accessibility and a walk time (straight line plus 30%, at 3 mph). Federal student–teacher ratios outside 4:1–35:1 are reporting errors and count as unreported. `data/overrides.json` holds hand fixes.

**Checking** (`scripts/data/validate.mjs`) refuses to publish data that looks wrong: a school count outside 250–340, duplicate IDs, a school outside the city or outside its own district, unknown boroughs or categories, missing grades or addresses, stations out of order, a district list that isn't exactly 1–32, too few stations or lines, or more than 30 schools without a state rating. The current build has 280 schools on the map and 19 not placed yet; ratings are 267 at the default level, 12 needing comprehensive support (5 of them transfer schools) and 1 needing targeted support.

### Commute times

To show commutes without calling a routing service, they're worked out in advance from everywhere in the city to every school (`scripts/travel/compute.py`). The city is divided into a grid of roughly 300 m squares (0.0027° of latitude by 0.0036° of longitude), keeping squares whose center is on land: 8,550 of them. For every square, [R5](https://github.com/conveyal/r5) (through [r5py](https://r5py.readthedocs.io/)) works out the trip to every school using OpenStreetMap streets, the MTA's subway and bus timetables (seven feeds) and the Staten Island Ferry.

- **Transit** is the median trip for departures between 7 and 8 a.m. on a Tuesday, walking at 3 mph. NYC Ferry, commuter rail and school buses aren't included. Cut off at two hours.
- **On foot** at 3 mph, cut off at 90 minutes.
- **Driving** is a no-traffic time on larger 2×2 squares (it's slow to compute and barely changes over a few hundred meters), cut off at 90 minutes. The browser turns it into a rush-hour time: times 1.5, or times 2 if the home or the school is in Manhattan's congestion zone (roughly south of 60th Street), based on MTA bus speeds and taxi speeds by hour. Filters and sorting use the rush-hour time; the display shows both.

Results are one byte per minute in block files of 6×6 squares, so a visitor's browser only downloads the ~30 KB around their home. An index file describes the grid; the whole set is about 330 files and 10 MB.

`npm run travel:setup` installs everything inside `.travel/` (not committed): a Python environment, Java 21 (checksum verified), the city's OpenStreetMap extract, the MTA timetables and the ferry timetable. nyc.gov blocks downloads that don't look like a browser, and the ferry file needs repacking (its files sit in a folder, carry byte order marks and include empty tables), which `repack_gtfs.py` does. R5's cache (about 1.6 GB) is kept inside the project, not your home folder. The full run takes about an hour and resumes if interrupted. The site works without it: the commute options stay hidden and the data check warns.

## Testing

Unit tests cover every filter (including how the home-based ones behave without a home), accent-insensitive search, chip labels with the rush-hour wording, each sort with missing values last, links (round-tripping every filter, never writing home data, cleaning up old links), grades, distances, the travel grid and rush hour, the three list headings, and the guide's questions and the filters each set of answers produces.

The smoke test (`smoke/smoke.mjs`) opens the real site in Chrome at desktop and phone sizes. It fakes the address service and the browser's location so runs repeat, and fails on any console error. It walks through every feature: the hidden list and one-line top bar, the search flow, both zoom buttons, the calm map (the home marker stays on the same pixel as the list opens and closes; a selected school stays within a few pixels while zooming; a school dragged behind the panel is brought back), setting a home three ways, the distance, district and commute filters staying out of links, the subway filters and layer, the state rating filter, full guide runs for a parent, a researcher and (on a phone) a student, the reviewers' note text against `smoke/reviewers-note.mjs`, and old links. Screenshots of every step land in `smoke/screenshots`.

## Publishing

`.github/workflows/deploy.yml` runs on every push to `main`: install, unit tests, build, then publish to GitHub Pages. First time: create the repository (public, on a free plan), set Pages to "GitHub Actions", push and watch the run, then check that the page, the school data and the travel index load, and run the smoke test against the live address.

## Data and estimate assumptions

The full list is in the site's "Reviewers: start here" note and in "About the data" at the bottom of the list. Admissions details in the guide (lotteries in April or May, applications typically due April 1, the common online application) were checked on November 5, 2026; they change each year, so check them each fall.
