import type { ReactElement } from 'react';

export const mapPreviewAttribution = 'OpenFreeMap © OpenMapTiles Data from OpenStreetMap';

export function MapPreview({
  fading = false,
  loading = true,
  showAttribution = true,
}: {
  fading?: boolean;
  loading?: boolean;
  showAttribution?: boolean;
}): ReactElement {
  return (
    <>
      <img
        alt=""
        aria-hidden="true"
        className={`map-placeholder${fading ? ' fading' : ''}`}
        decoding="sync"
        draggable="false"
        fetchPriority="high"
        src="/map/dsv-korea-placeholder.webp"
      />
      {loading ? <div className="map-loading-state" role="status">지도 불러오는 중</div> : null}
      {showAttribution ? <div className="map-placeholder-attribution" aria-hidden="true">{mapPreviewAttribution}</div> : null}
    </>
  );
}
