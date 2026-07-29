import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { loadMapProviderProfile } from '../services/map-provider';
import { MapPreview } from './MapPreview';
import {
  applyDepartureMarkerMetadata,
  createDepartureMarkerElement,
} from './DepartureMarker';

type DepartureLocationMapProps = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
};

const settingsLocationZoom = 16.8;

export function DepartureLocationMap({
  address,
  latitude,
  longitude,
  onChange,
}: DepartureLocationMapProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const abortController = new AbortController();
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    setStatus('loading');

    loadMapProviderProfile(abortController.signal)
      .then((profile) => {
        if (cancelled || !containerRef.current) return;
        const coordinates = coordinatePair(latitude, longitude);
        map = new maplibregl.Map({
          attributionControl: false,
          bearing: 0,
          center: coordinates ?? profile.initialView.center,
          container: containerRef.current,
          maxBounds: profile.bounds,
          pitch: 0,
          style: profile.styleUrl,
          zoom: coordinates === null ? profile.initialView.zoom : settingsLocationZoom,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.AttributionControl({ compact: true }));
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        map.on('click', (event) => {
          onChangeRef.current(roundCoordinate(event.lngLat.lat), roundCoordinate(event.lngLat.lng));
        });
        map.on('load', () => {
          if (cancelled || map === null) return;
          configureSettingsMapDetail(map);
          setStatus('ready');
        });
        map.on('error', () => {
          if (!cancelled && !map?.loaded()) setStatus('failed');
        });
      })
      .catch((error: unknown) => {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) setStatus('failed');
      });

    return () => {
      cancelled = true;
      abortController.abort();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coordinates = coordinatePair(latitude, longitude);
    if (coordinates === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const element = createDepartureMarkerElement({
        address,
        latitude: coordinates[1],
        longitude: coordinates[0],
      });
      element.classList.add('draggable');
      const marker = new maplibregl.Marker({ draggable: true, element })
        .setLngLat(coordinates)
        .addTo(map);
      marker.on('dragend', () => {
        const coordinate = marker.getLngLat();
        onChangeRef.current(roundCoordinate(coordinate.lat), roundCoordinate(coordinate.lng));
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat(coordinates);
      applyDepartureMarkerMetadata(markerRef.current.getElement(), {
        address,
        latitude: coordinates[1],
        longitude: coordinates[0],
      });
    }
    map.easeTo({ center: coordinates, duration: 280, zoom: Math.max(map.getZoom(), settingsLocationZoom) });
  }, [address, latitude, longitude, status]);

  return (
    <div className="settings-location-map-shell" aria-label="출발 위치 지도">
      <MapPreview fading={status === 'ready'} loading={status === 'loading'} showAttribution={status !== 'ready'} />
      <div className={`settings-location-map${status === 'ready' ? ' visible' : ''}`} ref={containerRef} />
      {status === 'failed' ? <p className="settings-location-map-error" role="alert">지도를 불러오지 못했습니다.</p> : null}
    </div>
  );
}

function coordinatePair(latitude: number | null, longitude: number | null): [number, number] | null {
  return latitude !== null
    && longitude !== null
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
    ? [longitude, latitude]
    : null;
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(7));
}

function configureSettingsMapDetail(map: maplibregl.Map): void {
  if (map.getLayer('building_footprints')) {
    map.setPaintProperty('building_footprints', 'fill-color', '#d8d0c6');
    map.setPaintProperty('building_footprints', 'fill-opacity', [
      'interpolate',
      ['linear'],
      ['zoom'],
      15,
      0.18,
      16,
      0.38,
      17,
      0.52,
      19,
      0.62,
    ]);
    map.setPaintProperty('building_footprints', 'fill-outline-color', '#a69c90');
  }

  if (!map.getLayer('settings-building-outline')) {
    map.addLayer({
      id: 'settings-building-outline',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 15,
      paint: {
        'line-color': '#948a7e',
        'line-opacity': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0.2,
          17,
          0.68,
          19,
          0.82,
        ],
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0.35,
          17,
          0.8,
          19,
          1.15,
        ],
      },
    });
  }

  if (!map.getLayer('settings-house-number')) {
    map.addLayer({
      id: 'settings-house-number',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'housenumber',
      minzoom: 16.5,
      layout: {
        'text-field': ['get', 'housenumber'],
        'text-font': ['Noto Sans Regular'],
        'text-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          16.5,
          10,
          19,
          12.5,
        ],
      },
      paint: {
        'text-color': '#4c4640',
        'text-halo-color': 'rgba(255,255,255,.94)',
        'text-halo-width': 1.2,
      },
    });
  }
}
