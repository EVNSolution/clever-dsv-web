import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { dispatchedDemoVehicles, routeCoordinates, routeOrigin, selectedDemoVehicle } from '../demo/selectors/route';
import type { Coordinate, DemoVehicle } from '../demo/model';
import type { DestinationDisplayMode, MapViewMode } from './MapControls';
import { fetchOsrmRoute, readCachedRoute, writeCachedRoute } from '../services/routing';
import type { DeliveryStopSelection } from '../services/control';
import { markerImageDefinitions } from './map/markers';
import { emptyLines, lineCollection, makeDropoffs, makeRoutes, makeStops, makeVehicles, selectedProgress } from './map/projection';
import type { FocusedStop } from './map/projection';

const openFreeMapStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';
const routeStopoverColor = '#ff7a00';
const vehicleLabelMinZoom = 11.3;
const mapCamera = {
  destinationZoom: 15.7,
  destinationDuration: 450,
  routeMaxZoom: 12.5,
} as const;
const routeWaypoints = (route: DemoVehicle['route']): Coordinate[] => [routeOrigin.coordinate, ...routeCoordinates[route]];

type MapCanvasProps = {
  ariaLabel: string;
  endpoint: string;
  mapMode: MapViewMode;
  destinationMode: DestinationDisplayMode;
  vehicleId?: string;
  showFleetOverview?: boolean;
  onVehicleSelect?: (vehicleId: string) => void;
  onDeliveryStopSelect?: (selection: DeliveryStopSelection) => void;
  selectedDeliveryStop?: DeliveryStopSelection;
  showOperationalLayers?: boolean;
};

export function MapCanvas({ ariaLabel, endpoint, mapMode, destinationMode, vehicleId, showFleetOverview = false, onVehicleSelect, onDeliveryStopSelect, selectedDeliveryStop, showOperationalLayers = true }: MapCanvasProps): ReactElement {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const routeGeometryRef = useRef<Record<string, Coordinate[]>>(Object.fromEntries(Object.keys(routeCoordinates).map((route) => [route, routeWaypoints(route as DemoVehicle['route'])])));
  const routeDropoffsRef = useRef<Record<string, Coordinate[]>>(Object.fromEntries(Object.entries(routeCoordinates)));
  const onVehicleSelectRef = useRef(onVehicleSelect);
  const onDeliveryStopSelectRef = useRef(onDeliveryStopSelect);
  const [mapReady, setMapReady] = useState(false);
  const [routeVersion, setRouteVersion] = useState(0);
  const spotlightVehicle = dispatchedDemoVehicles.find((vehicle) => vehicle.id === vehicleId);
  const visibleVehicles = showFleetOverview ? dispatchedDemoVehicles : [spotlightVehicle ?? selectedDemoVehicle()];
  const routeScopeKey = showFleetOverview ? 'fleet' : visibleVehicles[0].route;
  onVehicleSelectRef.current = onVehicleSelect;
  onDeliveryStopSelectRef.current = onDeliveryStopSelect;
  const focusedVehicle = selectedDeliveryStop
    ? controlVehicle(selectedDeliveryStop.vehicleId)
    : undefined;
  const focusedStop = selectedDeliveryStop && focusedVehicle
    ? {
        ...selectedDeliveryStop,
        coordinate: (routeDropoffsRef.current[focusedVehicle.route] ?? routeCoordinates[focusedVehicle.route])[selectedDeliveryStop.stopNo - 1],
      }
    : undefined;

  useEffect(() => {
    if (!mapRef.current) return undefined;
    let cancelled = false;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: openFreeMapStyleUrl,
      center: [126.995, 37.43],
      zoom: 10.35,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });
    mapInstanceRef.current = map;
    (window as typeof window & { dsvMap?: maplibregl.Map }).dsvMap = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('load', () => {
      if (showOperationalLayers) addMarkerImages(map);
      if (!cancelled) setMapReady(true);
    });

    return () => {
      cancelled = true;
      mapInstanceRef.current = null;
      delete (window as typeof window & { dsvMap?: maplibregl.Map }).dsvMap;
      map.remove();
    };
  }, [showOperationalLayers]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;
    map.easeTo({ pitch: mapMode === '3d' ? 58 : 0, bearing: mapMode === '3d' ? -18 : 0, duration: 0 });
  }, [mapMode, mapReady]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !showOperationalLayers) return undefined;
    const routes = [...new Set(visibleVehicles.map((vehicle) => vehicle.route))];
    routes.forEach((route) => {
      const cached = readCachedRoute(endpoint, route);
      routeGeometryRef.current[route] = cached?.coordinates ?? routeWaypoints(route);
      routeDropoffsRef.current[route] = cached?.dropoffs.length ? cached.dropoffs : routeCoordinates[route];
    });
    if (!map.getSource('demo-routes')) addMapLayers(
      map,
      destinationMode,
      (selectedId) => onVehicleSelectRef.current?.(selectedId),
      (stop) => onDeliveryStopSelectRef.current?.(stop),
    );
    updateMapData(map, visibleVehicles, spotlightVehicle, routeGeometryRef.current, routeDropoffsRef.current, destinationMode, focusedStop);
    return undefined;
  }, [destinationMode, endpoint, focusedStop, mapReady, routeVersion, showFleetOverview, showOperationalLayers, vehicleId]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady || !showOperationalLayers) return;
    if (focusedStop && focusedStop.vehicleId === vehicleId) {
      map.easeTo({ center: focusedStop.coordinate, zoom: mapCamera.destinationZoom, duration: mapCamera.destinationDuration });
      return;
    }
    const routes = [...new Set(visibleVehicles.map((vehicle) => vehicle.route))];
    fitMap(map, spotlightVehicle ? routeGeometryRef.current[spotlightVehicle.route] : routes.flatMap((route) => routeGeometryRef.current[route]));
  }, [focusedStop, mapReady, showFleetOverview, showOperationalLayers, vehicleId]);

  useEffect(() => {
    if (!mapReady || !showOperationalLayers) return undefined;
    const routes = [...new Set(visibleVehicles.map((vehicle) => vehicle.route))];
    const controllers = routes.map((route) => {
      const controller = new AbortController();
      fetchOsrmRoute(endpoint, routeWaypoints(route), controller.signal).then((estimate) => {
        if (!estimate) return;
        routeGeometryRef.current[route] = estimate.coordinates;
        routeDropoffsRef.current[route] = estimate.dropoffs;
        writeCachedRoute(endpoint, route, estimate);
        setRouteVersion((version) => version + 1);
      }).catch(() => undefined);
      return controller;
    });
    return () => controllers.forEach((controller) => controller.abort());
  }, [endpoint, mapReady, routeScopeKey, showOperationalLayers]);

  return (
    <article className="card map-card" aria-label="실시간 차량 지도">
      <div className="map-wrap">
        <div className="map-canvas" ref={mapRef} aria-label={ariaLabel} />
      </div>
    </article>
  );
}

function addMarkerImages(map: maplibregl.Map): void {
  for (const { id, image, options } of markerImageDefinitions()) {
    if (!map.hasImage(id)) map.addImage(id, image, options);
  }
}

function addMapLayers(map: maplibregl.Map, destinationMode: DestinationDisplayMode, onVehicleSelect: (vehicleId: string) => void, onStopSelect: (stop: DeliveryStopSelection) => void): void {
  map.addSource('demo-routes', { type: 'geojson', data: emptyLines() });
  map.addSource('demo-route-selected', { type: 'geojson', data: emptyLines() });
  map.addSource('demo-route-done', { type: 'geojson', data: emptyLines() });
  map.addSource('demo-route-next', { type: 'geojson', data: emptyLines() });
  map.addSource('demo-origin', { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: routeOrigin.name }, geometry: { type: 'Point', coordinates: routeOrigin.coordinate } }] } });
  map.addSource('demo-stops', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('demo-dropoffs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('demo-vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  map.addLayer({ id: 'demo-routes', type: 'line', source: 'demo-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0066cc', 'line-width': 1, 'line-opacity': 0.2 } });
  map.addLayer({ id: 'demo-route-selected', type: 'line', source: 'demo-route-selected', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#0066cc', 'line-width': 4, 'line-opacity': 0.88 } });
  map.addLayer({ id: 'demo-route-done', type: 'line', source: 'demo-route-done', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#8e8e93', 'line-width': 4.2, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'demo-route-next', type: 'line', source: 'demo-route-next', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#1f8b4c', 'line-width': 5, 'line-opacity': 0.95 } });
  map.addLayer({
    id: 'demo-stop-points', type: 'circle', source: 'demo-stops', minzoom: 9.5,
    layout: { visibility: destinationMode === 'point' ? 'visible' : 'none', 'circle-sort-key': ['get', 'sortKey'] },
    paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
  });
  map.addLayer({
    id: 'demo-stop-point-labels', type: 'symbol', source: 'demo-stops', minzoom: 9.5,
    layout: { visibility: destinationMode === 'point' ? 'visible' : 'none', 'symbol-sort-key': ['get', 'sortKey'], 'text-field': ['get', 'label'], 'text-size': 10, 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.35)', 'text-halo-width': 0.6 },
  });
  map.addLayer({
    id: 'demo-stop-markers', type: 'symbol', source: 'demo-stops', minzoom: 9.5,
    layout: { visibility: destinationMode === 'marker' ? 'visible' : 'none', 'symbol-sort-key': ['get', 'sortKey'], 'icon-image': ['get', 'pinImage'], 'icon-size': 0.62, 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.85], 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,.28)', 'text-halo-width': 0.7 },
  });
  map.addLayer({
    id: 'demo-dropoffs', type: 'circle', source: 'demo-dropoffs', minzoom: 15.5,
    paint: { 'circle-radius': ['case', ['get', 'active'], 5, 2.8], 'circle-color': routeStopoverColor, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.5 },
  });
  map.addLayer({
    id: 'demo-dropoff-labels', type: 'symbol', source: 'demo-dropoffs', minzoom: 15.5,
    layout: { 'text-field': '정차', 'text-size': 9, 'text-offset': [0, -1.15] },
    paint: { 'text-color': routeStopoverColor, 'text-halo-color': '#ffffff', 'text-halo-width': 1 },
  });
  map.addLayer({
    id: 'demo-vehicles', type: 'symbol', source: 'demo-vehicles',
    layout: { 'icon-image': ['get', 'markerImage'], 'icon-size': 0.75, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sortKey'] },
  });
  map.addLayer({
    id: 'demo-vehicle-labels', type: 'symbol', source: 'demo-vehicles', minzoom: vehicleLabelMinZoom,
    filter: ['==', ['get', 'selected'], false],
    layout: { 'text-field': ['get', 'plate'], 'text-size': 12, 'text-offset': [0, -1.08], 'text-anchor': 'bottom', 'text-allow-overlap': true, 'text-ignore-placement': true, 'symbol-sort-key': ['get', 'sortKey'] },
    paint: { 'text-color': '#1d1d1f', 'text-halo-color': '#ffffff', 'text-halo-width': 2.2 },
  });
  map.addLayer({
    id: 'demo-vehicle-label-spotlight', type: 'symbol', source: 'demo-vehicles',
    filter: ['==', ['get', 'selected'], true],
    layout: { 'text-field': ['get', 'plate'], 'text-size': 12, 'text-offset': [0, -1.08], 'text-anchor': 'bottom', 'text-allow-overlap': true, 'text-ignore-placement': true, 'symbol-sort-key': ['get', 'sortKey'] },
    paint: { 'text-color': '#1d1d1f', 'text-halo-color': '#ffffff', 'text-halo-width': 2.2 },
  });
  map.addLayer({ id: 'demo-origin', type: 'symbol', source: 'demo-origin', layout: { 'icon-image': 'origin-store-marker', 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true } });

  for (const layer of ['demo-vehicles', 'demo-vehicle-labels', 'demo-vehicle-label-spotlight', 'demo-routes', 'demo-route-selected', 'demo-route-done', 'demo-route-next']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', layer, (event) => {
      const selectedId = event.features?.[0]?.properties?.vehicleId as string | undefined;
      if (selectedId) onVehicleSelect(selectedId);
    });
  }
  for (const layer of ['demo-stop-points', 'demo-stop-point-labels', 'demo-stop-markers']) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
    map.on('click', layer, (event) => {
      const feature = event.features?.[0];
      const vehicleId = feature?.properties?.vehicleId as string | undefined;
      const deliveryStopId = feature?.properties?.deliveryStopId as string | undefined;
      const stopNo = Number(feature?.properties?.stopNo);
      if (!vehicleId || !deliveryStopId || !Number.isFinite(stopNo)) return;
      onStopSelect({ deliveryStopId, vehicleId, stopNo });
    });
  }
}

function updateMapData(map: maplibregl.Map, vehicles: DemoVehicle[], spotlightVehicle: DemoVehicle | undefined, geometries: Record<string, Coordinate[]>, dropoffs: Record<string, Coordinate[]>, destinationMode: DestinationDisplayMode, focusedStop?: FocusedStop): void {
  setGeoJson(map, 'demo-routes', makeRoutes(vehicles, geometries));
  setGeoJson(map, 'demo-stops', makeStops(vehicles, spotlightVehicle, focusedStop));
  setGeoJson(map, 'demo-dropoffs', makeDropoffs(spotlightVehicle, dropoffs, focusedStop));
  setGeoJson(map, 'demo-vehicles', makeVehicles(vehicles, spotlightVehicle));
  const selectedRoute = spotlightVehicle ? geometries[spotlightVehicle.route] : undefined;
  const selectedVehicleId = spotlightVehicle?.id;
  setGeoJson(map, 'demo-route-selected', selectedRoute && selectedVehicleId ? lineCollection(selectedRoute, selectedVehicleId) : emptyLines());
  const progress = spotlightVehicle && selectedRoute ? selectedProgress(selectedRoute, routeCoordinates[spotlightVehicle.route], spotlightVehicle) : { done: [], next: [] };
  setGeoJson(map, 'demo-route-done', progress.done.length > 1 && selectedVehicleId ? lineCollection(progress.done, selectedVehicleId) : emptyLines());
  setGeoJson(map, 'demo-route-next', progress.next.length > 1 && selectedVehicleId ? lineCollection(progress.next, selectedVehicleId) : emptyLines());
  map.setLayoutProperty('demo-stop-points', 'visibility', destinationMode === 'point' ? 'visible' : 'none');
  map.setLayoutProperty('demo-stop-point-labels', 'visibility', destinationMode === 'point' ? 'visible' : 'none');
  map.setLayoutProperty('demo-stop-markers', 'visibility', destinationMode === 'marker' ? 'visible' : 'none');
}

function setGeoJson(map: maplibregl.Map, sourceId: string, data: FeatureCollection): void {
  (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(data);
}

function controlVehicle(vehicleId: string): DemoVehicle | undefined {
  return dispatchedDemoVehicles.find((vehicle) => vehicle.id === vehicleId);
}

function fitMap(map: maplibregl.Map, coordinates: Coordinate[]): void {
  if (!coordinates.length) return;
  const bounds = coordinates.reduce((nextBounds, coordinate) => nextBounds.extend(coordinate), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
  map.fitBounds(bounds, { padding: { top: 150, right: 430, bottom: 70, left: 130 }, duration: 0, maxZoom: mapCamera.routeMaxZoom });
}
