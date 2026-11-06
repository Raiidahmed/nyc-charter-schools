// All shared state lives here: filters, sort and search, the selected school,
// the home and its travel times, whether the list is open, and the map camera.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  applyFilters,
  clearAll,
  distancesFrom,
  type FilterContext,
  type Filters,
  type HomePlace,
} from '../lib/filters.ts';
import type { DistrictFeature } from '../lib/geo.ts';
import { isSearching, matchesSearch } from '../lib/search.ts';
import { DEFAULT_SORT, HOME_SORTS, sortSchools, type SortKey } from '../lib/sort.ts';
import { cellFor, readTrips, type Trips } from '../lib/travel.ts';
import type { School, Summary, TravelIndex } from '../lib/types.ts';
import { fromSearchParams, linkSearch } from '../lib/url.ts';
import { CalmCamera, inView, type View } from '../map/camera.ts';
import { homeDistrict, loadRememberedHome, saveRememberedHome } from './home.ts';

export interface AppData {
  schools: School[];
  summary: Summary;
  districts: DistrictFeature[];
}

export type TravelStatus = 'loading' | 'ready' | 'missing' | 'outside';
export type DialogName = 'guide' | 'reviewers' | 'filters' | null;

type Update<T> = T | ((prev: T) => T);

export interface Explorer {
  data: AppData;
  byId: Map<string, School>;
  filters: Filters;
  setFilters: (f: Update<Filters>) => void;
  clearFilters: () => void;
  query: string;
  setQuery: (q: string) => void;
  searching: boolean;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  selected: School | null;
  select: (id: string) => void;
  closeDetails: () => void;
  backToList: () => void;
  lastViewedId: string | null;
  listOpen: boolean;
  setListOpen: (open: boolean) => void;
  panelOpen: boolean;
  home: HomePlace | null;
  setHome: (h: Omit<HomePlace, 'district'> | null, opts?: { move?: boolean }) => boolean;
  remember: boolean;
  setRemember: (on: boolean) => void;
  travelIndex: TravelIndex | null;
  travelStatus: TravelStatus;
  trips: Trips | null;
  ctx: FilterContext;
  /** Schools matching the search only, the base for option counts. */
  searched: School[];
  /** Schools matching the search and every filter. */
  matching: School[];
  /** Matching schools in sort order. */
  sorted: School[];
  /** What the list shows: matches in view, or every match while searching. */
  listed: School[];
  /** How many matches are in the uncovered part of the map. */
  inViewCount: number;
  subwayOn: boolean;
  setSubwayOn: (on: boolean) => void;
  hoverId: string | null;
  setHoverId: (id: string | null) => void;
  pinMode: boolean;
  setPinMode: (on: boolean) => void;
  dialog: DialogName;
  setDialog: (d: DialogName) => void;
  notice: string | null;
  setNotice: (msg: string | null) => void;
  camera: CalmCamera;
  initialSchool: School | null;
}

const ExplorerContext = createContext<Explorer | null>(null);

export function useExplorer(): Explorer {
  const v = useContext(ExplorerContext);
  if (!v) throw new Error('useExplorer must be used inside ExplorerProvider');
  return v;
}

const BASE = import.meta.env.BASE_URL;

export function ExplorerProvider({ data, children }: { data: AppData; children: ReactNode }) {
  const byId = useMemo(() => new Map(data.schools.map((s) => [s.id, s])), [data.schools]);
  const initial = useMemo(() => {
    const linkCtx = {
      schoolIds: new Set(data.schools.map((s) => s.id)),
      networks: new Set(data.schools.flatMap((s) => (s.network ? [s.network] : []))),
      lines: new Set(data.schools.flatMap((s) => s.stations.flatMap((st) => st.lines))),
    };
    return fromSearchParams(new URLSearchParams(window.location.search), linkCtx);
  }, [data.schools]);
  const remembered = useMemo(() => loadRememberedHome(), []);

  const [filters, setFiltersState] = useState<Filters>(initial.filters);
  const [query, setQuery] = useState(initial.query);
  const [sort, setSort] = useState<SortKey>(remembered && initial.sort === DEFAULT_SORT ? 'distance' : initial.sort);
  const [selectedId, setSelectedId] = useState<string | null>(initial.school);
  const [lastViewedId, setLastViewedId] = useState<string | null>(initial.school);
  const [listOpen, setListOpen] = useState(isSearching(initial.query));
  const [home, setHomeState] = useState<HomePlace | null>(remembered);
  const [remember, setRememberState] = useState(remembered !== null);
  const [travelIndexState, setTravelIndexState] = useState<{ status: 'loading' | 'ready' | 'missing'; index: TravelIndex | null }>({ status: 'loading', index: null });
  const [loadedTrips, setLoadedTrips] = useState<{ home: HomePlace; trips: Trips } | null>(null);
  const [subwayOn, setSubwayOn] = useState(initial.filters.lines.length > 0);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [camera] = useState(() => new CalmCamera());
  const [now] = useState(() => new Date());
  const focusNext = useRef<string | null>(null);
  const homeRef = useRef(home);
  useEffect(() => {
    homeRef.current = home;
  }, [home]);

  useEffect(() => camera.onView(setView), [camera]);

  const setFilters = useCallback((f: Update<Filters>) => setFiltersState(f), []);
  const clearFilters = useCallback(() => setFiltersState((f) => clearAll(f)), []);

  // --- Home ---------------------------------------------------------------------
  const setHome = useCallback(
    (h: Omit<HomePlace, 'district'> | null, opts: { move?: boolean } = {}) => {
      if (!h) {
        // Clearing the home removes the filters and sorts that depend on it.
        setHomeState(null);
        setFiltersState((f) => ({ ...f, maxMiles: null, maxCommute: null, myDistrict: false }));
        setSort((s) => (HOME_SORTS.includes(s) ? DEFAULT_SORT : s));
        return true;
      }
      const district = homeDistrict(h.lat, h.lon, data.districts);
      if (district === undefined) {
        setNotice('That spot is outside New York City. Choose a place in the five boroughs.');
        return false;
      }
      setNotice(null);
      if (!homeRef.current) setSort((s) => (s === DEFAULT_SORT ? 'distance' : s));
      setHomeState({ ...h, district });
      if (opts.move) camera.moveTo(h.lat, h.lon, 13);
      return true;
    },
    [data.districts, camera],
  );

  const setRemember = useCallback((on: boolean) => setRememberState(on), []);
  useEffect(() => saveRememberedHome(remember ? home : null), [remember, home]);

  // --- Travel times ---------------------------------------------------------------
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${BASE}data/travel/index.json`, { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<TravelIndex>) : Promise.reject(new Error('missing'))))
      .then(
        (index) => setTravelIndexState({ status: 'ready', index }),
        () => !ctrl.signal.aborted && setTravelIndexState({ status: 'missing', index: null }),
      );
    return () => ctrl.abort();
  }, []);

  const travelIndex = travelIndexState.index;
  const cell = useMemo(() => (home && travelIndex ? cellFor(travelIndex, home.lat, home.lon) : null), [home, travelIndex]);
  const travelStatus: TravelStatus = travelIndexState.status !== 'ready' ? travelIndexState.status : home && !cell ? 'outside' : 'ready';

  // A visitor only downloads the block of squares around their home.
  const blockCache = useRef(new Map<string, Promise<Uint8Array>>());
  useEffect(() => {
    if (!home || !travelIndex || !cell) return;
    const ctrl = new AbortController();
    const cache = blockCache.current;
    let block = cache.get(cell.block);
    if (!block) {
      block = fetch(`${BASE}data/travel/b/${cell.block}.bin`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`travel block ${cell.block}`))))
        .then((b) => new Uint8Array(b));
      cache.set(cell.block, block);
    }
    block.then(
      (bytes) => !ctrl.signal.aborted && setLoadedTrips({ home, trips: readTrips(travelIndex, bytes, cell.slot, home, data.schools) }),
      () => cache.delete(cell.block),
    );
    return () => ctrl.abort();
  }, [home, travelIndex, cell, data.schools]);
  const trips = loadedTrips && loadedTrips.home === home ? loadedTrips.trips : null;

  // --- Derived lists --------------------------------------------------------------
  const distances = useMemo(() => (home ? distancesFrom(home, data.schools) : null), [home, data.schools]);
  const ctx: FilterContext = useMemo(() => ({ home, distances, trips, now }), [home, distances, trips, now]);
  const searching = isSearching(query);
  const searched = useMemo(() => (searching ? data.schools.filter((s) => matchesSearch(s, query)) : data.schools), [data.schools, query, searching]);
  const matching = useMemo(() => applyFilters(searched, filters, ctx), [searched, filters, ctx]);
  const sorted = useMemo(() => sortSchools(matching, sort, ctx, filters.commuteMode), [matching, sort, ctx, filters.commuteMode]);
  const visible = useMemo(() => sorted.filter((s) => inView(view, s.lat, s.lon)), [sorted, view]);
  const listed = searching ? sorted : visible;

  // --- Selection and the panel ---------------------------------------------------------
  const select = useCallback((id: string) => {
    focusNext.current = id;
    setSelectedId(id);
    setLastViewedId(id);
    setHoverId(null);
  }, []);
  const closeDetails = useCallback(() => setSelectedId(null), []);
  const backToList = useCallback(() => {
    setSelectedId(null);
    setListOpen(true);
  }, []);

  // Runs after the layouts have applied the new panel padding.
  useEffect(() => {
    const id = focusNext.current;
    if (!id || id !== selectedId) return;
    focusNext.current = null;
    const s = byId.get(id);
    if (s) camera.focus(s.lat, s.lon);
  }, [selectedId, byId, camera]);

  // Escape closes the open school, unless something else used the key first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (pinMode) {
        setPinMode(false);
        return;
      }
      if (dialog) return;
      if (selectedId) setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinMode, dialog, selectedId]);

  // --- Shareable link -------------------------------------------------------------------
  useEffect(() => {
    const search = linkSearch({ filters, query, school: selectedId, sort });
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', url);
  }, [filters, query, selectedId, sort]);

  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const initialSchool = useMemo(() => (initial.school ? (byId.get(initial.school) ?? null) : null), [initial.school, byId]);

  const value: Explorer = {
    data,
    byId,
    filters,
    setFilters,
    clearFilters,
    query,
    setQuery,
    searching,
    sort,
    setSort,
    selected,
    select,
    closeDetails,
    backToList,
    lastViewedId,
    listOpen,
    setListOpen,
    panelOpen: listOpen || selected !== null,
    home,
    setHome,
    remember,
    setRemember,
    travelIndex,
    travelStatus,
    trips,
    ctx,
    searched,
    matching,
    sorted,
    listed,
    inViewCount: visible.length,
    subwayOn,
    setSubwayOn,
    hoverId,
    setHoverId,
    pinMode,
    setPinMode,
    dialog,
    setDialog,
    notice,
    setNotice,
    camera,
    initialSchool,
  };
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

