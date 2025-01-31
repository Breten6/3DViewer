// src/FitBounds.jsx
import { useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';

function FitBounds({ geoJSONData, maxZoom = 18 }) {
  const map = useMap();

  useEffect(() => {
    if (
      geoJSONData &&
      geoJSONData.features &&
      geoJSONData.features.length > 0
    ) {
      const layer = L.geoJSON(geoJSONData);
      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [50, 50],
          maxZoom: maxZoom
        });
      }
    }
  }, [geoJSONData, map, maxZoom]);

  return null;
}

export default FitBounds;