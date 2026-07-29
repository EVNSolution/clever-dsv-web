import type { ReactElement, TransitionEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import maplibregl from 'maplibre-gl';
import { loadMapProviderProfile } from '../services/map-provider';
import { MapPreview } from './MapPreview';
import {
  applyDepartureMarkerMetadata,
  createDepartureMarkerElement,
} from './DepartureMarker';
import type { DepartureLocation } from './DepartureMarker';

type MapCanvasProps = {
  ariaLabel: string;
  departureLocation?: DepartureLocation | null;
  fitPoints?: boolean;
  onMapPointAdd?: (coordinate: MapCanvasCoordinate) => void;
  onReady?: () => void;
  onPointSelect?: (pointId: string) => void;
  points?: MapCanvasPoint[];
  selectionCoordinates?: MapCanvasCoordinate[];
  selectionMode?: boolean;
  selectedPointId?: string;
  selectedPointIds?: string[];
  variant?: 'embedded' | 'fullscreen';
};

export type { DepartureLocation } from './DepartureMarker';

export type MapCanvasCoordinate = [longitude: number, latitude: number];

export type MapCanvasPoint = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  tone?: 'assigned' | 'unassigned';
};

type MapLoadState =
  | { status: 'preview' }
  | { status: 'revealing' }
  | { status: 'ready' }
  | { message: string; status: 'failed' };

const initialMapLoadTimeoutMs = 15_000;

export function MapCanvas({
  ariaLabel,
  departureLocation = null,
  fitPoints = false,
  onMapPointAdd,
  onReady,
  onPointSelect,
  points = [],
  selectionCoordinates = [],
  selectionMode = false,
  selectedPointId,
  selectedPointIds = [],
  variant = 'fullscreen',
}: MapCanvasProps): ReactElement {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const departureMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const onReadyRef = useRef(onReady);
  const onMapPointAddRef = useRef(onMapPointAdd);
  const readyNotifiedRef = useRef(false);
  const [loadState, setLoadState] = useState<MapLoadState>({ status: 'preview' });
  const [loadAttempt, setLoadAttempt] = useState(0);
  onReadyRef.current = onReady;
  onMapPointAddRef.current = onMapPointAdd;

  useEffect(() => {
    if (!mapRef.current) return undefined;
    const abortController = new AbortController();
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    let initialLoadComplete = false;
    let initialLoadFailed = false;
    let initialLoadTimeout: number | undefined;
    readyNotifiedRef.current = false;
    setLoadState({ status: 'preview' });

    loadMapProviderProfile(abortController.signal)
      .then((profile) => {
        if (cancelled || !mapRef.current) return;
        map = new maplibregl.Map({
          attributionControl: false,
          bearing: 0,
          center: profile.initialView.center,
          container: mapRef.current,
          dragRotate: false,
          maxBounds: profile.bounds,
          maxPitch: 0,
          pitch: 0,
          pitchWithRotate: false,
          style: profile.styleUrl,
          touchPitch: false,
          zoom: profile.initialView.zoom,
        });
        mapInstanceRef.current = map;
        (window as typeof window & { dsvMap?: maplibregl.Map }).dsvMap = map;
        map.addControl(new maplibregl.AttributionControl({ compact: true }));
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        initialLoadTimeout = window.setTimeout(() => {
          if (cancelled || initialLoadComplete) return;
          initialLoadFailed = true;
          setLoadState({
            message: '지도 공급자의 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',
            status: 'failed',
          });
        }, initialMapLoadTimeoutMs);
        map.on('load', () => {
          if (initialLoadTimeout !== undefined) window.clearTimeout(initialLoadTimeout);
          if (initialLoadFailed) return;
          initialLoadComplete = true;
          if (!cancelled) {
            setLoadState({ status: 'revealing' });
            notifyMapReady();
          }
        });
        map.on('error', () => {
          if (!cancelled && !initialLoadComplete && !initialLoadFailed) {
            initialLoadFailed = true;
            if (initialLoadTimeout !== undefined) window.clearTimeout(initialLoadTimeout);
            setLoadState({
              message: '지도 데이터를 불러오지 못했습니다. 네트워크 연결과 지도 공급자 상태를 확인해 주세요.',
              status: 'failed',
            });
          }
        });
      })
      .catch((error: unknown) => {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        setLoadState({
          message: '지도 공급자 설정을 불러오지 못했습니다.',
          status: 'failed',
        });
      });

    return () => {
      cancelled = true;
      abortController.abort();
      if (initialLoadTimeout !== undefined) window.clearTimeout(initialLoadTimeout);
      departureMarkerRef.current?.remove();
      departureMarkerRef.current = null;
      pointMarkersRef.current.forEach((marker) => marker.remove());
      pointMarkersRef.current = [];
      mapInstanceRef.current = null;
      delete (window as typeof window & { dsvMap?: maplibregl.Map }).dsvMap;
      map?.remove();
    };
  }, [loadAttempt]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (
      !map
      || !departureLocation
      || (loadState.status !== 'revealing' && loadState.status !== 'ready')
    ) {
      departureMarkerRef.current?.remove();
      departureMarkerRef.current = null;
      return;
    }
    const coordinates: [number, number] = [
      departureLocation.longitude,
      departureLocation.latitude,
    ];
    if (!departureMarkerRef.current) {
      departureMarkerRef.current = new maplibregl.Marker({
        anchor: 'bottom',
        element: createDepartureMarkerElement(departureLocation),
      })
        .setLngLat(coordinates)
        .addTo(map);
      return;
    }
    departureMarkerRef.current.setLngLat(coordinates);
    applyDepartureMarkerMetadata(
      departureMarkerRef.current.getElement(),
      departureLocation,
    );
  }, [departureLocation, loadState.status]);

  useEffect(() => {
    pointMarkersRef.current.forEach((marker) => marker.remove());
    pointMarkersRef.current = [];
    const map = mapInstanceRef.current;
    if (!map || (loadState.status !== 'revealing' && loadState.status !== 'ready')) return;
    const selectedIds = new Set(selectedPointIds);
    if (selectedPointId !== undefined) selectedIds.add(selectedPointId);
    pointMarkersRef.current = points.map((point) => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `dispatch-map-marker ${point.tone ?? 'unassigned'}${selectedIds.has(point.id) ? ' selected' : ''}`;
      element.textContent = point.label;
      element.setAttribute('aria-label', `${point.label} 배송지`);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onPointSelect?.(point.id);
      });
      return new maplibregl.Marker({ anchor: 'center', element })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map);
    });
    const fitCoordinates: MapCanvasCoordinate[] = points.map((point) => [
      point.longitude,
      point.latitude,
    ]);
    if (departureLocation) {
      fitCoordinates.push([
        departureLocation.longitude,
        departureLocation.latitude,
      ]);
    }
    if (fitPoints && fitCoordinates.length > 0) {
      if (fitCoordinates.length === 1) {
        map.jumpTo({ center: fitCoordinates[0], zoom: 11 });
      } else {
        const bounds = fitCoordinates.reduce(
          (current, coordinate) => current.extend(coordinate),
          new maplibregl.LngLatBounds(),
        );
        map.fitBounds(bounds, { duration: 0, maxZoom: 13, padding: 54 });
      }
    }
    return () => {
      pointMarkersRef.current.forEach((marker) => marker.remove());
      pointMarkersRef.current = [];
    };
  }, [departureLocation, fitPoints, loadState.status, onPointSelect, points, selectedPointId, selectedPointIds]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || (loadState.status !== 'revealing' && loadState.status !== 'ready')) return;
    const sourceId = 'dispatch-selection-source';
    const fillLayerId = 'dispatch-selection-fill';
    const lineLayerId = 'dispatch-selection-line';
    const vertexLayerId = 'dispatch-selection-vertices';
    const features: Feature[] = selectionFeatures(selectionCoordinates);
    const data: FeatureCollection = { type: 'FeatureCollection', features };
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data });
    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      filter: ['==', '$type', 'Polygon'],
      paint: {
        'fill-color': '#0066cc',
        'fill-opacity': 0.14,
      },
    });
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      filter: ['in', '$type', 'LineString', 'Polygon'],
      paint: {
        'line-color': '#0066cc',
        'line-width': 2,
        'line-dasharray': [2, 1],
      },
    });
    map.addLayer({
      id: vertexLayerId,
      type: 'circle',
      source: sourceId,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-color': '#ffffff',
        'circle-radius': 4,
        'circle-stroke-color': '#0066cc',
        'circle-stroke-width': 2,
      },
    });
  }, [loadState.status, selectionCoordinates]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || loadState.status !== 'ready') return;
    const canvas = map.getCanvas();
    canvas.style.cursor = selectionMode ? 'crosshair' : '';
    if (!selectionMode) return;
    const handleClick = (event: maplibregl.MapMouseEvent) => {
      onMapPointAddRef.current?.([event.lngLat.lng, event.lngLat.lat]);
    };
    map.on('click', handleClick);
    return () => {
      canvas.style.cursor = '';
      map.off('click', handleClick);
    };
  }, [loadState.status, selectionMode]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const selected = points.find((point) => point.id === selectedPointId);
    if (!map || !selected || loadState.status !== 'ready') return;
    map.easeTo({
      center: [selected.longitude, selected.latitude],
      duration: 260,
      zoom: Math.max(map.getZoom(), 12),
    });
  }, [loadState.status, points, selectedPointId]);

  useEffect(() => {
    if (loadState.status !== 'revealing' || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    completeReveal();
  }, [loadState.status]);

  function notifyMapReady(): void {
    if (readyNotifiedRef.current) return;
    readyNotifiedRef.current = true;
    onReadyRef.current?.();
  }

  function completeReveal(): void {
    setLoadState({ status: 'ready' });
  }

  function finishCanvasTransition(event: TransitionEvent<HTMLDivElement>): void {
    if (event.propertyName === 'opacity' && loadState.status === 'revealing') completeReveal();
  }

  const liveMapVisible = loadState.status === 'revealing' || loadState.status === 'ready';
  const previewFading = loadState.status === 'revealing' || loadState.status === 'ready';

  return (
    <article className={`card map-card ${variant}`} aria-busy={loadState.status === 'preview' || loadState.status === 'revealing'} aria-label={ariaLabel}>
      <div className="map-wrap">
        <MapPreview
          fading={previewFading}
          loading={loadState.status === 'preview'}
          showAttribution={loadState.status === 'preview' || loadState.status === 'failed'}
        />
        <div
          className={`map-canvas${liveMapVisible ? ' visible' : ''}${loadState.status === 'ready' ? ' ready' : ''}`}
          ref={mapRef}
          aria-label={ariaLabel}
          onTransitionEnd={finishCanvasTransition}
        />
        {loadState.status === 'failed' ? (
          <div className="map-load-state error" role="alert">
            <p>{loadState.message}</p>
            <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>다시 시도</button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function selectionFeatures(coordinates: MapCanvasCoordinate[]): Feature[] {
  const vertices: Feature[] = coordinates.map((coordinate) => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: coordinate },
  }));
  if (coordinates.length < 2) return vertices;
  const line: Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
  if (coordinates.length < 3) return [line, ...vertices];
  const polygon: Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[...coordinates, coordinates[0]]] },
  };
  return [polygon, ...vertices];
}
