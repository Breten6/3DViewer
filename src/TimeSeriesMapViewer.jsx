// src/TimeSeriesMapViewer.jsx
import React, { useMemo, useEffect, useState, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  ZoomControl,
  Marker,
  Popup,
  useMapEvent,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Supercluster from 'supercluster';
import FitBounds from './FitBounds';
import ClusterPopupContent from './ClusterPopupContent';
import MarkerPopupContent from './MarkerPopupContent';
import ReactDOM from 'react-dom/client';

import {
  Box,      
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from '@mui/material';

import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});


const createClusterIcon = (count) => {
  let size = 'small';
  if (count >= 100) {
    size = 'large';
  } else if (count >= 50) {
    size = 'medium';
  }
  return L.divIcon({
    html: `<div class="cluster-marker ${size}"><span>${count}</span></div>`,
    className: 'cluster-icon',
    iconSize: [40, 40],
  });
};

/** Flatten nested objects into "prop1.this" keys.
 *  If we encounter an array, we store it as-is under newKey. */
function flattenProps(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const newKey = prefix ? prefix + '.' + k : k;
    if (Array.isArray(v)) {
      result[newKey] = v;
    } else if (v && typeof v === 'object') {
      const childFlat = flattenProps(v, newKey);
      Object.assign(result, childFlat);
    } else {
      result[newKey] = v;
    }
  }
  return result;
}

function TimeSeriesMapViewer({
  geoJSONData,
  currentTime = Number.MAX_SAFE_INTEGER,
  selectedTags = [],
}) {
  console.log('TimeSeriesMapViewer props:', { geoJSONData, currentTime, selectedTags });

  const mapRef = useRef();
  const layerRegistry = useRef(new Map()); 

  // 1. Extract features
  const features = useMemo(() => {
    if (geoJSONData?.data?.features) {
      return geoJSONData.data.features;
    }
    return [];
  }, [geoJSONData]);
  const prevFeaturesCountRef = useRef(features.length);

  // 2. Time & tag filtering
  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      // time filter
      const ft = f.properties?.time;
      if (ft != null) {
        const ftNum = typeof ft === 'string' ? new Date(ft).getTime() : ft;
        if (ftNum > currentTime) return false;
      }
      // tag filter
      if (selectedTags.length > 0) {
        const t = f.properties?.tags;
        if (t) {
          const arr = Array.isArray(t) ? t : [t];
          return arr.some((tag) => selectedTags.includes(tag));
        }
      }
      return true;
    });
  }, [features, currentTime, selectedTags]);

  useEffect(() => {
    console.log(
      `Total features: ${features.length}, filtered: ${filteredFeatures.length}`
    );
  }, [features, filteredFeatures]);

  // 3. Geometry type filtering 
  const [geometryFilter, setGeometryFilter] = useState([]);
  const allGeomTypes = useMemo(() => {
    const setOfTypes = new Set();
    features.forEach((f) => {
      if (f.geometry?.type) {
        setOfTypes.add(f.geometry.type);
      }
    });
    return Array.from(setOfTypes);
  }, [features]);

  useEffect(() => {
    setGeometryFilter(allGeomTypes);
  }, [allGeomTypes]);

  const handleToggleGeomType = (type) => {
    setGeometryFilter((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  // 4. Multi-Key property filtering
  const [propertyFilters, setPropertyFilters] = useState({});
  const [activeKey, setActiveKey] = useState('');
  const [activeValues, setActiveValues] = useState([]);

  useEffect(() => {
    if (!activeKey) {
      setActiveValues([]);
    } else {
      setActiveValues(propertyFilters[activeKey] || []);
    }
  }, [activeKey, propertyFilters]);

  const allPropertyValuesMap = useMemo(() => {
    const map = {};
    features.forEach((f) => {
      const flatProps = flattenProps(f.properties || {});
      Object.entries(flatProps).forEach(([k, v]) => {
        if (!map[k]) {
          map[k] = new Set();
        }
        if (Array.isArray(v)) {
          v.forEach((item) => {
            map[k].add(item);
          });
        } else {
          map[k].add(v);
        }
      });
    });
    for (const k in map) {
      map[k] = Array.from(map[k]);
    }
    return map;
  }, [features]);

  const handleToggleValue = (val) => {
    if (!activeKey) return;
    setActiveValues((prev) => {
      let newArr;
      if (prev.includes(val)) {
        newArr = prev.filter((v) => v !== val);
      } else {
        newArr = [...prev, val];
      }
      setPropertyFilters((oldPF) => {
        const clone = { ...oldPF };
        if (newArr.length === 0) {
          delete clone[activeKey];
        } else {
          clone[activeKey] = newArr;
        }
        return clone;
      });
      return newArr;
    });
  };

  const handleSelectAllValues = (checked) => {
    if (!activeKey) return;
    const allVals = allPropertyValuesMap[activeKey] || [];
    const newArr = checked ? allVals : [];
    setActiveValues(newArr);
    setPropertyFilters((oldPF) => {
      const clone = { ...oldPF };
      if (newArr.length === 0) {
        delete clone[activeKey];
      } else {
        clone[activeKey] = newArr;
      }
      return clone;
    });
  };

  const handleSelectKey = (e) => {
    setActiveKey(e.target.value);
  };

  useEffect(() => {
    if (features.length !== prevFeaturesCountRef.current) {
      console.log('Detected feature count change => resetting all property filters');
      setPropertyFilters({});
      setActiveKey('');
      setActiveValues([]);
    }
    prevFeaturesCountRef.current = features.length;
  }, [features]);

  // 5. Final filtering
  const geometryFilteredFeatures = useMemo(() => {
    if (!geometryFilter || geometryFilter.length === 0) {
      return [];
    }
    return filteredFeatures.filter((f) => geometryFilter.includes(f.geometry?.type));
  }, [filteredFeatures, geometryFilter]);

  const propertyFilteredFeatures = useMemo(() => {
    let result = geometryFilteredFeatures;
    for (const [k, vals] of Object.entries(propertyFilters)) {
      if (!vals || vals.length === 0) continue;
      result = result.filter((f) => {
        const flatProps = flattenProps(f.properties || {});
        const propVal = flatProps[k];
        if (Array.isArray(propVal)) {
          return propVal.some((item) => vals.includes(item));
        } else {
          return vals.includes(propVal);
        }
      });
    }
    return result;
  }, [geometryFilteredFeatures, propertyFilters]);

  const finalFilteredFeatures = propertyFilteredFeatures;

  useEffect(() => {
    console.log(
      `Features after second filtering (geometry + multiKey): ${finalFilteredFeatures.length}`
    );
  }, [finalFilteredFeatures]);

  // 6. Split into pointFeatures / otherFeatures
  const pointFeatures = useMemo(() => {
    return finalFilteredFeatures.filter(
      (f) => f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint'
    );
  }, [finalFilteredFeatures]);

  const otherFeatures = useMemo(() => {
    return finalFilteredFeatures.filter(
      (f) => !(f.geometry?.type === 'Point' || f.geometry?.type === 'MultiPoint')
    );
  }, [finalFilteredFeatures]);

  // 7. Supercluster 
  const [clusters, setClusters] = useState([]);
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(5);

  const supercluster = useMemo(() => {
    return new Supercluster({
      radius: 75,
      maxZoom: 20,
    }).load(
      pointFeatures.map((feature) => ({
        type: 'Feature',
        properties: {
          cluster: false,
          ...feature.properties,
        },
        geometry: {
          type: 'Point',
          coordinates: feature.geometry.coordinates,
        },
      }))
    );
  }, [pointFeatures]);

  const MapEvents = () => {
    useMapEvent('moveend', (e) => {
      const map = e.target;
      const b = map.getBounds();
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(map.getZoom());
    });
    return null;
  };

  useEffect(() => {
    if (bounds) {
      const c = supercluster.getClusters(bounds, zoom);
      setClusters(c);
      console.log(`Clusters at zoom ${zoom}`, c);
    }
  }, [supercluster, bounds, zoom]);

  // 8. Bind popup for lines/polygons
  useEffect(() => {
    if (!mapRef.current) return;

    layerRegistry.current.forEach((cleanup, layer) => {
      cleanup();
      layer.remove();
    });
    layerRegistry.current.clear();

    if (!otherFeatures.length) return;

    const layerGroup = L.geoJSON(otherFeatures, {
      style: { color: '#3388ff', weight: 2 },
      onEachFeature: (feature, layer) => {
        const container = L.DomUtil.create('div');
        const root = ReactDOM.createRoot(container);

        root.render(
          <MarkerPopupContent
            key={`${feature.id || Date.now()}-${Math.random()}`}
            properties={feature.properties || {}}
          />
        );

        const popup = L.popup({
          autoClose: true,
          closeOnClick: true,
          className: 'isolated-popup',
        }).setContent(container);

        layer.bindPopup(popup);

        const cleanup = () => {
          root.unmount();
          container.remove();
          layer.unbindPopup();
        };
        layerRegistry.current.set(layer, cleanup);
      },
    }).addTo(mapRef.current);

    return () => {
      if (mapRef.current && mapRef.current.hasLayer(layerGroup)) {
        mapRef.current.removeLayer(layerGroup);
      }
    };
  }, [otherFeatures]);

  // 9. Render clusters and single markers
  const renderMarkers = () => {
    return clusters.map((cluster) => {
      const [lng, lat] = cluster.geometry.coordinates;
      const { cluster: isCluster, point_count } = cluster.properties;

      if (isCluster) {
        // This is a cluster
        let leaves = [];
        try {
          leaves = supercluster.getLeaves(cluster.properties.cluster_id, 1000, 0);
        } catch (e) {
          console.error('Error getting cluster leaves', e);
        }
        return (
          <Marker
            key={`cluster-${cluster.properties.cluster_id}`}
            position={[lat, lng]}
            icon={createClusterIcon(point_count)}
          >
            <Popup>
              <ClusterPopupContent
                leaves={leaves}
                count={point_count}
                maxMarkers={10}
                maxHeight={300}
              />
            </Popup>
          </Marker>
        );
      } else {
        // Single point
        return (
          <Marker
            key={`marker-${lng}-${lat}-${cluster.properties.name || 'unknown'}`}
            position={[lat, lng]}
          >
            <Popup>
              <MarkerPopupContent
                properties={cluster.properties}
                coords={[lat, lng]}
                hideCoordinate={false}
              />
            </Popup>
          </Marker>
        );
      }
    });
  };

  // 10. FitBounds
  const filteredGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: finalFilteredFeatures,
  }), [finalFilteredFeatures]);

  const noData = features.length === 0;

  useEffect(() => {
    return () => {
      layerRegistry.current.forEach((cleanup) => cleanup());
      layerRegistry.current.clear();
    };
  }, []);

  // Render property filter chips
  const renderFilterChips = () => {
    return Object.entries(propertyFilters).map(([k, vals]) => {
      const joined = vals.join(',');
      const display = joined.length > 20 ? joined.slice(0, 20) + '...' : joined;
      return (
        <Chip
          key={k}
          label={`${k}: ${display}`}
          variant="outlined"
          size="small"
          onDelete={() => {
            setPropertyFilters((old) => {
              const copy = { ...old };
              delete copy[k];
              return copy;
            });
            if (activeKey === k) {
              setActiveKey('');
              setActiveValues([]);
            }
          }}
          sx={{ mr: 1, mb: 1 }}
        />
      );
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {noData ? (
        <div style={{ width: '100%', height: '100%', background: '#fafafa' }}>
          <p style={{ textAlign: 'center' }}>No valid GeoJSON data</p>
        </div>
      ) : (
        <MapContainer
          center={[39.9, 116.4]}
          zoom={5}
          ref={(m) => {
            mapRef.current = m;
          }}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            crossOrigin="anonymous"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents />
          {clusters.length > 0 && renderMarkers()}
          <FitBounds geoJSONData={filteredGeoJSON} maxZoom={15} />
        </MapContainer>
      )}

      <Box
        sx={{
          position: 'absolute',
          top: 10,
          left: 10,
          width: 230,
          maxHeight: 480,
          overflow: 'auto',
          backgroundColor: 'rgba(255,255,255,0.9)',
          p: 2,
          borderRadius: 2,
          zIndex: 999,
        }}
      >
        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap' }}>
          {renderFilterChips()}
        </Box>

        {/* Geometry type filtering */}
        <FormControl component="fieldset" variant="standard" sx={{ mb: 2 }}>
          <FormLabel component="legend" sx={{ fontSize: '0.9rem' }}>
            Geometry Types
          </FormLabel>
          <FormGroup>
            {allGeomTypes.map((type) => (
              <FormControlLabel
                key={type}
                control={
                  <Checkbox
                    checked={geometryFilter.includes(type)}
                    onChange={() => handleToggleGeomType(type)}
                  />
                }
                label={type}
              />
            ))}
          </FormGroup>
        </FormControl>

        {/* Select property key */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel id="select-property-key-label">Property Key</InputLabel>
          <Select
            labelId="select-property-key-label"
            label="Property Key"
            value={activeKey}
            onChange={handleSelectKey}
            MenuProps={{
              PaperProps: { style: { zIndex: 10000 } },
              disablePortal: false,
            }}
          >
            <MenuItem value="">(none)</MenuItem>
            {Object.keys(allPropertyValuesMap).map((k) => (
              <MenuItem key={k} value={k}>
                {k}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Display values for the chosen key */}
        {activeKey && allPropertyValuesMap[activeKey] && (
          <FormControl component="fieldset" variant="standard">
            <FormLabel component="legend" sx={{ fontSize: '0.9rem' }}>
              {`Values for [${activeKey}]`}
            </FormLabel>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={
                      activeValues.length > 0 &&
                      activeValues.length === allPropertyValuesMap[activeKey].length
                    }
                    indeterminate={
                      activeValues.length > 0 &&
                      activeValues.length < allPropertyValuesMap[activeKey].length
                    }
                    onChange={(e) => handleSelectAllValues(e.target.checked)}
                  />
                }
                label="(Select All)"
              />
              {allPropertyValuesMap[activeKey].map((val) => (
                <FormControlLabel
                  key={String(val)}
                  control={
                    <Checkbox
                      checked={activeValues.includes(val)}
                      onChange={() => handleToggleValue(val)}
                    />
                  }
                  label={String(val)}
                />
              ))}
            </FormGroup>
          </FormControl>
        )}
      </Box>
    </div>
  );
}

export default TimeSeriesMapViewer;