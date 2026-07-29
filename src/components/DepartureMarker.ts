export type DepartureLocation = {
  address: string;
  latitude: number;
  longitude: number;
};

const houseIconPath = 'M10 3.2 3.5 8.4v8.1h4v-5h5v5h4V8.4L10 3.2Z';
const svgNamespace = 'http://www.w3.org/2000/svg';

export function createDepartureMarkerElement(
  location: DepartureLocation,
): HTMLElement {
  const marker = document.createElement('span');
  marker.className = 'departure-map-marker';
  marker.setAttribute('role', 'img');
  applyDepartureMarkerMetadata(marker, location);

  const pin = document.createElement('span');
  pin.className = 'departure-map-marker__pin';
  pin.setAttribute('aria-hidden', 'true');

  const icon = document.createElementNS(svgNamespace, 'svg');
  icon.classList.add('departure-map-marker__icon');
  icon.setAttribute('viewBox', '0 0 20 20');
  const path = document.createElementNS(svgNamespace, 'path');
  path.setAttribute('d', houseIconPath);
  icon.append(path);
  pin.append(icon);
  marker.append(pin);
  return marker;
}

export function applyDepartureMarkerMetadata(
  marker: HTMLElement,
  location: DepartureLocation,
): void {
  const address = location.address.trim() || '출발 위치';
  marker.setAttribute('aria-label', `출발 위치: ${address}`);
  marker.setAttribute('title', address);
  marker.dataset.latitude = String(location.latitude);
  marker.dataset.longitude = String(location.longitude);
}
