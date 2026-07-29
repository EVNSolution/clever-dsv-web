import { apiConfig } from '../api/config';
import { ApiError, requestV1ReadJson } from '../api/client';

export type MapProviderMode = 'public_allowlisted' | 'self_hosted';

export type MapProviderProfile = {
  attribution: string;
  bounds: [number, number, number, number];
  initialView: {
    center: [number, number];
    zoom: number;
  };
  profileId: string;
  providerMode: MapProviderMode;
  regionCode: string;
  styleUrl: string;
  version: string;
};

export async function loadMapProviderProfile(signal?: AbortSignal): Promise<MapProviderProfile> {
  const data = apiConfig.mode === 'mock'
    ? await loadWebHostedProfile(signal)
    : await requestV1ReadJson<unknown>('map/profile', { signal });
  return adaptMapProviderProfile(data);
}

async function loadWebHostedProfile(signal?: AbortSignal): Promise<unknown> {
  const response = await fetch('/map/profile.json', {
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    throw new ApiError(response.status, '지도 공급자 프로필을 불러오지 못했습니다.');
  }
  return response.json();
}

function adaptMapProviderProfile(data: unknown): MapProviderProfile {
  if (!isExactObject(data, [
    'attribution',
    'bounds',
    'initialView',
    'profileId',
    'providerMode',
    'regionCode',
    'styleUrl',
    'version',
  ])) throw invalidMapProviderProfile(data);
  if (!nonEmptyString(data.attribution)
    || !coordinateBounds(data.bounds)
    || !initialView(data.initialView, data.bounds)
    || !nonEmptyString(data.profileId)
    || (data.providerMode !== 'public_allowlisted' && data.providerMode !== 'self_hosted')
    || !nonEmptyString(data.regionCode)
    || !validStyleUrl(data.styleUrl)
    || !nonEmptyString(data.version)) {
    throw invalidMapProviderProfile(data);
  }
  return {
    attribution: data.attribution,
    bounds: [...data.bounds],
    initialView: {
      center: [...data.initialView.center],
      zoom: data.initialView.zoom,
    },
    profileId: data.profileId,
    providerMode: data.providerMode,
    regionCode: data.regionCode,
    styleUrl: data.styleUrl,
    version: data.version,
  };
}

function initialView(value: unknown, bounds: [number, number, number, number]): value is MapProviderProfile['initialView'] {
  if (!isExactObject(value, ['center', 'zoom']) || !coordinate(value.center) || !finiteNumber(value.zoom) || value.zoom < 0 || value.zoom > 24) return false;
  const [longitude, latitude] = value.center;
  const [west, south, east, north] = bounds;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function coordinateBounds(value: unknown): value is MapProviderProfile['bounds'] {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(finiteNumber)) return false;
  const [west, south, east, north] = value;
  return west >= -180 && east <= 180 && south >= -90 && north <= 90 && west < east && south < north;
}

function coordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && finiteNumber(value[0])
    && finiteNumber(value[1])
    && value[0] >= -180
    && value[0] <= 180
    && value[1] >= -90
    && value[1] <= 90;
}

function validStyleUrl(value: unknown): value is string {
  if (!nonEmptyString(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isExactObject(value: unknown, fields: string[]): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every((field) => keys.includes(field));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function invalidMapProviderProfile(body: unknown): ApiError {
  return new ApiError(502, '지도 공급자 프로필 API 응답 형식이 올바르지 않습니다.', body);
}
