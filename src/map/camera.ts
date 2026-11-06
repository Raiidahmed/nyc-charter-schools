// Keeps the map calm.
//
// The map's padding tells it which parts of the screen are covered, so it can
// center things in the visible area, but changing the padding normally makes
// the whole map jump sideways. So when a panel opens or closes we work out the
// center that leaves everything on screen where it is, and apply the new
// padding and that center together. If the map is mid-animation we wait for
// it to finish first, because starting any jump cancels an animation.
//
// Every other move is short and straight: never the swooping zoom out and back
// in that map libraries do by default. Nothing moves on its own afterwards, so
// moving the map away is never undone.
import type { LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import { NYC_BOUNDS } from '../lib/geo.ts';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface View {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const STREET_ZOOM = 16;
const SELECT_ZOOM_STEP = 3;
const SELECT_MS = 800;
const MOVE_MS = 600;
const EDGE = 16;

const ZERO: Padding = { top: 0, right: 0, bottom: 0, left: 0 };

/** The map's current padding, with every side filled in. */
function paddingOf(map: MapLibreMap): Padding {
  const p = map.getPadding();
  return { top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 };
}

function samePadding(a: Padding, b: Padding): boolean {
  return Math.round(a.top) === Math.round(b.top) && Math.round(a.right) === Math.round(b.right) && Math.round(a.bottom) === Math.round(b.bottom) && Math.round(a.left) === Math.round(b.left);
}

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

declare global {
  interface Window {
    charterMap?: {
      project: (lat: number, lon: number) => { x: number; y: number };
      zoom: () => number;
      moving: () => boolean;
      padding: () => Padding;
    };
  }
}

export class CalmCamera {
  private map: MapLibreMap | null = null;
  private padding: Padding = ZERO;
  private queue: (() => void)[] = [];
  private waiting = false;
  private viewListeners = new Set<(v: View) => void>();

  attach(map: MapLibreMap, initial: { school?: { lat: number; lon: number } }) {
    this.map = map;
    // A read-only handle the browser smoke test uses to measure positions.
    window.charterMap = {
      project: (lat, lon) => map.project([lon, lat]),
      zoom: () => map.getZoom(),
      moving: () => map.isMoving(),
      padding: () => paddingOf(map),
    };
    map.setPadding(this.padding);
    if (initial.school) map.jumpTo({ center: [initial.school.lon, initial.school.lat], zoom: 15 });
    else map.fitBounds(NYC_BOUNDS, { padding: 24, duration: 0 });
    map.on('moveend', () => this.emitView());
    map.on('resize', () => this.emitView());
    this.emitView();
  }

  detach() {
    this.map = null;
  }

  get ready() {
    return this.map !== null;
  }

  private duration(ms: number) {
    return reducedMotion() ? 0 : ms;
  }

  /** Runs a camera change once the map isn't animating. */
  private run(op: () => void) {
    const map = this.map;
    if (!map) return;
    if (!map.isMoving() && !this.waiting) {
      op();
      return;
    }
    this.queue.push(op);
    if (this.waiting) return;
    this.waiting = true;
    map.once('moveend', () => {
      this.waiting = false;
      const ops = this.queue.splice(0);
      for (const o of ops) this.run(o);
    });
  }

  /** Applies new padding without moving anything on screen. */
  setPadding(next: Padding) {
    this.padding = next;
    if (!this.map) return;
    this.run(() => {
      const map = this.map!;
      if (samePadding(paddingOf(map), this.padding)) return;
      const p = this.padding;
      const el = map.getContainer();
      const x = p.left + (el.clientWidth - p.left - p.right) / 2;
      const y = p.top + (el.clientHeight - p.top - p.bottom) / 2;
      map.jumpTo({ center: map.unproject([x, y]), padding: p });
      this.emitView();
    });
  }

  /** Whether a point is in the part of the map nobody's covering. */
  isVisible(lat: number, lon: number): boolean {
    const map = this.map;
    if (!map) return false;
    const pt = map.project([lon, lat]);
    const el = map.getContainer();
    const p = paddingOf(map);
    return pt.x >= p.left + EDGE && pt.x <= el.clientWidth - p.right - EDGE && pt.y >= p.top + EDGE && pt.y <= el.clientHeight - p.bottom - EDGE;
  }

  /**
   * Selecting a school zooms in gently, up to three levels, stopping at street
   * level. A visible school stays exactly where it was clicked; an off-screen
   * or covered one is brought to the middle as the map zooms.
   */
  focus(lat: number, lon: number) {
    this.run(() => {
      const map = this.map!;
      const zoom = Math.max(map.getZoom(), Math.min(map.getZoom() + SELECT_ZOOM_STEP, STREET_ZOOM));
      const duration = this.duration(SELECT_MS);
      if (this.isVisible(lat, lon)) {
        if (zoom - map.getZoom() < 0.01) return;
        map.easeTo({ zoom, around: [lon, lat], duration, essential: false });
      } else {
        map.easeTo({ center: [lon, lat], zoom, duration, essential: false });
      }
    });
  }

  /** Short, straight move to frame some places. */
  fit(points: { lat: number; lon: number }[], maxZoom = 15) {
    if (!points.length) return;
    this.run(() => {
      const map = this.map!;
      if (points.length === 1) {
        map.easeTo({ center: [points[0].lon, points[0].lat], zoom: Math.max(map.getZoom(), 14), duration: this.duration(MOVE_MS) });
        return;
      }
      let west = Infinity;
      let south = Infinity;
      let east = -Infinity;
      let north = -Infinity;
      for (const p of points) {
        west = Math.min(west, p.lon);
        east = Math.max(east, p.lon);
        south = Math.min(south, p.lat);
        north = Math.max(north, p.lat);
      }
      const bounds: LngLatBoundsLike = [
        [west, south],
        [east, north],
      ];
      map.fitBounds(bounds, { padding: 48, maxZoom, linear: true, duration: this.duration(MOVE_MS) });
    });
  }

  /** Short, straight move to a point, zooming in to at least `zoom`. */
  moveTo(lat: number, lon: number, zoom: number) {
    this.run(() => {
      const map = this.map!;
      map.easeTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), zoom), duration: this.duration(MOVE_MS) });
    });
  }

  zoomTo(lat: number, lon: number, zoom: number) {
    this.run(() => this.map!.easeTo({ center: [lon, lat], zoom, duration: this.duration(MOVE_MS) }));
  }

  /** The uncovered part of the map, for the "in view" list. */
  view(): View | null {
    const map = this.map;
    if (!map) return null;
    const el = map.getContainer();
    const p = paddingOf(map);
    const nw = map.unproject([p.left, p.top]);
    const se = map.unproject([el.clientWidth - p.right, el.clientHeight - p.bottom]);
    return { west: nw.lng, north: nw.lat, east: se.lng, south: se.lat };
  }

  onView(fn: (v: View) => void) {
    this.viewListeners.add(fn);
    return () => {
      this.viewListeners.delete(fn);
    };
  }

  private emitView() {
    const v = this.view();
    if (v) for (const fn of this.viewListeners) fn(v);
  }
}

export function inView(v: View | null, lat: number, lon: number): boolean {
  if (!v) return true;
  return lat <= v.north && lat >= v.south && lon >= v.west && lon <= v.east;
}
