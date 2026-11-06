import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AttributionControl,
  Layer,
  Map,
  Marker,
  NavigationControl,
  Popup,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
  type MarkerDragEvent,
} from 'react-map-gl/maplibre';
import { neighborhoodAt } from '../lib/geocode.ts';
import { NYC_BOUNDS } from '../lib/geo.ts';
import { useExplorer } from '../state/Explorer.tsx';
import { HouseIcon } from '../ui/icons.tsx';

// Vite's bundling breaks the worker script the map library loads for itself,
// so point it at the file explicitly.
maplibregl.setWorkerUrl(workerUrl);

const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const BLUE = '#3b5bdb';
const ORANGE = '#f76707';
const BASE = import.meta.env.BASE_URL;
/** West, south, east, north: the city and a margin around it. */
const MAX_BOUNDS: [number, number, number, number] = [-74.9, 40.25, -73.0, 41.25];

function circle(lat: number, lon: number, miles: number) {
  const coords: [number, number][] = [];
  const dLat = miles / 69.05;
  const dLon = miles / (69.17 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI;
    coords.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: coords } };
}

export function MapView() {
  const x = useExplorer();
  const { camera, matching, selected, hoverId, home, filters, pinMode, subwayOn, initialSchool } = x;
  const mapRef = useRef<MapRef>(null);
  const [hovered, setHovered] = useState<{ id: string; name: string; lat: number; lon: number } | null>(null);

  useEffect(() => () => camera.detach(), [camera]);

  const schoolData = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: matching.map((s) => ({
        type: 'Feature' as const,
        properties: { id: s.id, name: s.name },
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
      })),
    }),
    [matching],
  );

  const highlightData = useMemo(() => {
    const features = [];
    const hover = hoverId ? x.byId.get(hoverId) : null;
    if (hover && hover.id !== selected?.id)
      features.push({ type: 'Feature' as const, properties: { kind: 'hover' }, geometry: { type: 'Point' as const, coordinates: [hover.lon, hover.lat] } });
    if (selected)
      features.push({ type: 'Feature' as const, properties: { kind: 'selected' }, geometry: { type: 'Point' as const, coordinates: [selected.lon, selected.lat] } });
    return { type: 'FeatureCollection' as const, features };
  }, [hoverId, selected, x.byId]);

  const districtData = useMemo(() => ({ type: 'FeatureCollection' as const, features: x.data.districts }), [x.data.districts]);
  const showDistrict = home?.district != null && filters.myDistrict;
  const showCircle = home && filters.maxMiles !== null;
  const circleData = useMemo(() => (home && filters.maxMiles ? circle(home.lat, home.lon, filters.maxMiles) : null), [home, filters.maxMiles]);

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    camera.attach(map, { school: initialSchool ?? undefined });
    // On a phone the attribution starts folded into its ⓘ button, so it doesn't cover the list button.
    if (window.matchMedia('(max-width: 760px)').matches)
      map.getContainer().querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  }, [camera, initialSchool]);

  const onClick = useCallback(
    async (e: MapLayerMouseEvent) => {
      if (pinMode) {
        const { lat, lng } = e.lngLat;
        x.setPinMode(false);
        const ok = x.setHome({ lat, lon: lng, label: 'Dropped pin', source: 'pin' });
        if (ok) {
          const place = await neighborhoodAt(lat, lng);
          if (place) x.setHome({ lat, lon: lng, label: `Dropped pin · ${place}`, source: 'pin' });
        }
        return;
      }
      const f = e.features?.[0];
      if (!f) return;
      if (f.layer.id === 'clusters') {
        const map = mapRef.current!.getMap();
        const source = map.getSource('schools') as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(f.properties.cluster_id as number);
        const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
        camera.zoomTo(lat, lon, Math.min(zoom + 0.5, 17));
        return;
      }
      if (f.layer.id === 'school-dots') {
        setHovered(null);
        x.select(String(f.properties.id));
      }
    },
    [pinMode, x, camera],
  );

  const onMouseMove = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.find((g) => g.layer.id === 'school-dots');
    if (!f) {
      setHovered(null);
      return;
    }
    const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
    const id = String(f.properties.id);
    setHovered((h) => (h?.id === id ? h : { id, name: String(f.properties.name), lat, lon }));
  }, []);

  const onDragEnd = useCallback(
    async (e: MarkerDragEvent) => {
      const { lat, lng } = e.lngLat;
      const ok = x.setHome({ lat, lon: lng, label: 'Dropped pin', source: 'pin' });
      if (!ok && home) x.setHome(home);
      if (ok) {
        const place = await neighborhoodAt(lat, lng);
        if (place) x.setHome({ lat, lon: lng, label: `Dropped pin · ${place}`, source: 'pin' });
      }
    },
    [x, home],
  );

  const lineFilter = filters.lines.length ? filters.lines : null;

  return (
    <Map
      ref={mapRef}
      mapLib={maplibregl}
      mapStyle={STYLE}
      initialViewState={{ bounds: NYC_BOUNDS, fitBoundsOptions: { padding: 24 } }}
      minZoom={9}
      maxZoom={18}
      maxBounds={MAX_BOUNDS}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      attributionControl={false}
      interactiveLayerIds={['clusters', 'school-dots']}
      cursor={pinMode ? 'crosshair' : hovered ? 'pointer' : undefined}
      onLoad={onLoad}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHovered(null)}
      style={{ position: 'absolute', inset: 0 }}
      aria-label="Map of charter schools"
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      <AttributionControl position="bottom-left" compact />

      <Source id="districts" type="geojson" data={districtData}>
        <Layer
          id="home-district-fill"
          type="fill"
          filter={['==', ['get', 'district'], home?.district ?? -1]}
          layout={{ visibility: showDistrict ? 'visible' : 'none' }}
          paint={{ 'fill-color': BLUE, 'fill-opacity': 0.05 }}
        />
        <Layer
          id="home-district-line"
          type="line"
          filter={['==', ['get', 'district'], home?.district ?? -1]}
          layout={{ visibility: showDistrict ? 'visible' : 'none' }}
          paint={{ 'line-color': BLUE, 'line-width': 2, 'line-opacity': 0.7 }}
        />
      </Source>

      {circleData && (
        <Source id="distance" type="geojson" data={circleData}>
          <Layer
            id="distance-circle"
            type="line"
            layout={{ visibility: showCircle ? 'visible' : 'none' }}
            paint={{ 'line-color': '#495057', 'line-width': 1.5, 'line-dasharray': [3, 2] }}
          />
        </Source>
      )}

      {subwayOn && (
        <Source id="subway-lines" type="geojson" data={`${BASE}data/subway-lines.geojson`}>
          <Layer
            id="subway-lines"
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 3.5],
              'line-opacity': lineFilter ? ['case', ['in', ['get', 'line'], ['literal', lineFilter]], 0.95, 0.15] : 0.8,
            }}
          />
        </Source>
      )}
      {subwayOn && (
        <Source id="subway-stations" type="geojson" data={`${BASE}data/subway-stations.geojson`}>
          <Layer
            id="subway-stations"
            type="circle"
            minzoom={11.5}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 15, 5],
              'circle-color': '#ffffff',
              'circle-stroke-color': '#343a40',
              'circle-stroke-width': 1.2,
            }}
          />
          <Layer
            id="subway-station-labels"
            type="symbol"
            minzoom={14}
            layout={{
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular'],
              'text-size': 11,
              'text-offset': [0, 1],
              'text-anchor': 'top',
              'text-optional': true,
            }}
            paint={{ 'text-color': '#343a40', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }}
          />
        </Source>
      )}

      <Source id="schools" type="geojson" data={schoolData} cluster clusterRadius={44} clusterMaxZoom={13}>
        <Layer
          id="clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': BLUE,
            'circle-opacity': 0.9,
            'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 30, 23],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          }}
        />
        <Layer
          id="cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Bold'], 'text-size': 13, 'text-allow-overlap': true }}
          paint={{ 'text-color': '#ffffff' }}
        />
        <Layer
          id="school-dots"
          type="circle"
          filter={['!', ['has', 'point_count']]}
          paint={{
            'circle-color': BLUE,
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 5, 15, 8],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          }}
        />
      </Source>

      <Source id="highlight" type="geojson" data={highlightData}>
        <Layer
          id="highlight-hover"
          type="circle"
          filter={['==', ['get', 'kind'], 'hover']}
          paint={{ 'circle-radius': 11, 'circle-color': BLUE, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 }}
        />
        <Layer
          id="highlight-selected"
          type="circle"
          filter={['==', ['get', 'kind'], 'selected']}
          paint={{ 'circle-radius': 10, 'circle-color': ORANGE, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 }}
        />
      </Source>

      {hovered && !pinMode && (
        <Popup longitude={hovered.lon} latitude={hovered.lat} closeButton={false} closeOnClick={false} offset={12} className="dot-label" focusAfterOpen={false}>
          {hovered.name}
        </Popup>
      )}

      {home && (
        <Marker longitude={home.lon} latitude={home.lat} anchor="bottom" draggable onDragEnd={onDragEnd}>
          <div className="home-marker" title="Your home. Drag to adjust." aria-label="Your home. Drag to adjust.">
            <HouseIcon />
          </div>
        </Marker>
      )}
    </Map>
  );
}
