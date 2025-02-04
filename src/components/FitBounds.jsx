// src/FitBounds.jsx
import { useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import L from 'leaflet';

function FitBounds({ geoJSONData, maxZoom = 18 }) {
  const map = useMap();
  // store last bounding reference to prevent repeated fits
  const prevBoundsHashRef = useRef('');

  useEffect(() => {
    if (!geoJSONData || !geoJSONData.features || geoJSONData.features.length === 0) return;

    const layer = L.geoJSON(geoJSONData);
    const bounds = layer.getBounds();
    if (!bounds.isValid()) return;

    // Convert current bounding box to a string
    const boundsStr = bounds.toBBoxString(); // "west,south,east,north"
    const newHash = `${boundsStr}--count:${geoJSONData.features.length}`;

    // If it's the same as last time, skip
    if (prevBoundsHashRef.current === newHash) {
      return;
    }
    prevBoundsHashRef.current = newHash;

    map.fitBounds(bounds, {
      padding: [50, 50],
      maxZoom,
    });
  }, [geoJSONData, map, maxZoom]);

  return null;
}

export default FitBounds;