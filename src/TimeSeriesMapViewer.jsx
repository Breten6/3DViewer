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
import FitBounds from './components/FitBounds';
import ClusterPopupContent from './components/ClusterPopupContent';
import MarkerPopupContent from './components/MarkerPopupContent';
import ReactDOM from 'react-dom/client';

import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Slider,
  Typography,
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

function flattenProps(obj, prefix = '') {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const newKey = prefix ? prefix + '.' + k : k;
    if (Array.isArray(v)) {
      result[newKey] = v;
    } else if (v && typeof v === 'object') {
      Object.assign(result, flattenProps(v, newKey));
    } else {
      result[newKey] = v;
    }
  }
  return result;
}

function TimeSeriesMapViewer({ geoJSONData, selectedTags = [] }) {
  console.log('TimeSeriesMapViewer props:', { geoJSONData, selectedTags });

  const mapRef = useRef();
  const layerRegistry = useRef(new Map());

  const features = useMemo(() => {
    if (geoJSONData?.data?.features) {
      return geoJSONData.data.features;
    }
    return [];
  }, [geoJSONData]);

  const prevFeaturesCountRef = useRef(features.length);

  const flattenedFeatures = useMemo(() => {
    return features.map((f) => ({
      ...f,
      _flatProps: flattenProps(f.properties || {}),
    }));
  }, [features]);

  const sortedTimePoints = useMemo(() => {
    const timeSet = new Set();
    features.forEach((f) => {
      const ft = f.properties?.time;
      if (ft) {
        const val = typeof ft === 'string' ? new Date(ft).getTime() : ft;
        timeSet.add(val);
      }
    });
    return Array.from(timeSet).sort((a, b) => a - b);
  }, [features]);

  const [currentTime, setCurrentTime] = useState(
    sortedTimePoints.length > 0 ? sortedTimePoints[sortedTimePoints.length - 1] : 0
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (sortedTimePoints.length > 0) {
      const last = sortedTimePoints[sortedTimePoints.length - 1];
      setCurrentTime(last);
    }
  }, [sortedTimePoints]);

  useEffect(() => {
    if (isPlaying) {
      const id = setInterval(() => {
        const nextT = sortedTimePoints.find((t) => t > currentTime);
        if (nextT) {
          setCurrentTime(nextT);
        } else {
          setIsPlaying(false);
        }
      }, 1000);
      intervalRef.current = id;
      return () => clearInterval(id);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [isPlaying, currentTime, sortedTimePoints]);

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (sortedTimePoints.length > 0 && currentTime === sortedTimePoints[sortedTimePoints.length - 1]) {
        setCurrentTime(sortedTimePoints[0]);
      }
      setIsPlaying(true);
    }
  };

  const [geometryFilter, setGeometryFilter] = useState([]);
  const allGeomTypes = useMemo(() => {
    const st = new Set();
    features.forEach((f) => {
      if (f.geometry?.type) {
        st.add(f.geometry.type);
      }
    });
    return Array.from(st);
  }, [features]);

  useEffect(() => {
    setGeometryFilter(allGeomTypes);
  }, [allGeomTypes]);

  const handleToggleGeomType = (type) => {
    setGeometryFilter((prev) => {
      if (prev.includes(type)) {
        return prev.filter((t) => t !== type);
      }
      return [...prev, type];
    });
  };

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
    flattenedFeatures.forEach((f) => {
      const flt = f._flatProps;
      for (const [k, v] of Object.entries(flt)) {
        if (!map[k]) map[k] = new Set();
        if (Array.isArray(v)) {
          v.forEach((it) => map[k].add(it));
        } else {
          map[k].add(v);
        }
      }
    });
    const obj = {};
    for (const k in map) {
      obj[k] = Array.from(map[k]);
    }
    return obj;
  }, [flattenedFeatures]);

  const handleToggleValue = (val) => {
    if (!activeKey) return;
    setActiveValues((prev) => {
      let newArr;
      if (prev.includes(val)) {
        newArr = prev.filter((x) => x !== val);
      } else {
        newArr = [...prev, val];
      }
      setPropertyFilters((old) => {
        const copy = { ...old };
        if (newArr.length === 0) {
          delete copy[activeKey];
        } else {
          copy[activeKey] = newArr;
        }
        return copy;
      });
      return newArr;
    });
  };

  const handleSelectAllValues = (checked) => {
    if (!activeKey) return;
    const allVals = allPropertyValuesMap[activeKey] || [];
    const newArr = checked ? allVals : [];
    setActiveValues(newArr);
    setPropertyFilters((old) => {
      const copy = { ...old };
      if (newArr.length === 0) {
        delete copy[activeKey];
      } else {
        copy[activeKey] = newArr;
      }
      return copy;
    });
  };

  const handleSelectKey = (e) => {
    setActiveKey(e.target.value);
  };

  useEffect(() => {
    if (features.length !== prevFeaturesCountRef.current) {
      setPropertyFilters({});
      setActiveKey('');
      setActiveValues([]);
    }
    prevFeaturesCountRef.current = features.length;
  }, [features]);

  const finalFilteredFeatures = useMemo(() => {
    return flattenedFeatures.filter((f) => {
      if (selectedTags.length > 0) {
        const tags = f.properties?.tags;
        if (tags) {
          const arr = Array.isArray(tags) ? tags : [tags];
          if (!arr.some((tg) => selectedTags.includes(tg))) {
            return false;
          }
        }
      }
      if (geometryFilter.length === 0) {
        return false;
      }
      if (!geometryFilter.includes(f.geometry?.type)) {
        return false;
      }
      for (const [k, vals] of Object.entries(propertyFilters)) {
        if (!vals || vals.length === 0) continue;
        const propVal = f._flatProps[k];
        if (Array.isArray(propVal)) {
          if (!propVal.some((item) => vals.includes(item))) {
            return false;
          }
        } else {
          if (!vals.includes(propVal)) {
            return false;
          }
        }
      }
      const ft = f.properties?.time;
      if (ft) {
        const val = typeof ft === 'string' ? new Date(ft).getTime() : ft;
        if (val > currentTime) {
          return false;
        }
      }
      return true;
    });
  }, [flattenedFeatures, selectedTags, geometryFilter, propertyFilters, currentTime]);

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

  const [clusters, setClusters] = useState([]);
  const [bounds, setBounds] = useState(null);
  const [zoom, setZoom] = useState(5);

  const superclusterInstance = useMemo(() => {
    return new Supercluster({ radius: 75, maxZoom: 20 }).load(
      pointFeatures.map((f) => ({
        type: 'Feature',
        properties: { ...f.properties },
        geometry: { type: 'Point', coordinates: f.geometry.coordinates },
      }))
    );
  }, [pointFeatures]);

  const MapEvents = () => {
    useMapEvent('moveend', (e) => {
      const m = e.target;
      const b = m.getBounds();
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      setZoom(m.getZoom());
    });
    return null;
  };

  useEffect(() => {
    if (bounds) {
      const c = superclusterInstance.getClusters(bounds, zoom);
      setClusters(c);
    }
  }, [superclusterInstance, bounds, zoom]);

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

  const renderMarkers = () => {
    return clusters.map((c) => {
      const [lng, lat] = c.geometry.coordinates;
      const { cluster: isCluster, point_count } = c.properties;
      if (isCluster) {
        let leaves = [];
        try {
          leaves = superclusterInstance.getLeaves(c.properties.cluster_id, 1000, 0);
        } catch (err) {
          console.error('Error calling getLeaves:', err);
        }
        return (
          <Marker
            key={`cluster-${c.properties.cluster_id}`}
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
        return (
          <Marker
            key={`marker-${lng}-${lat}-${c.properties.name || 'unknown'}`}
            position={[lat, lng]}
          >
            <Popup>
              <MarkerPopupContent
                properties={c.properties}
                coords={[lat, lng]}
                hideCoordinate={false}
              />
            </Popup>
          </Marker>
        );
      }
    });
  };

  const filteredGeoJSON = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: finalFilteredFeatures,
    }),
    [finalFilteredFeatures]
  );

  const noData = features.length === 0;

  useEffect(() => {
    return () => {
      layerRegistry.current.forEach((cleanup) => cleanup());
      layerRegistry.current.clear();
    };
  }, []);

  const applyGeometryAndPropertyFilters = (baseArr, geomFilter, propFilter) => {
    if (!geomFilter || geomFilter.length === 0) return [];
    return baseArr.filter((f) => {
      if (selectedTags.length > 0) {
        const tags = f.properties?.tags;
        if (tags) {
          const arr = Array.isArray(tags) ? tags : [tags];
          if (!arr.some((tg) => selectedTags.includes(tg))) {
            return false;
          }
        }
      }
      if (!geomFilter.includes(f.geometry?.type)) {
        return false;
      }
      for (const [k, vals] of Object.entries(propFilter)) {
        if (!vals || vals.length === 0) continue;
        const propVal = f._flatProps[k];
        if (Array.isArray(propVal)) {
          if (!propVal.some((x) => vals.includes(x))) {
            return false;
          }
        } else {
          if (!vals.includes(propVal)) {
            return false;
          }
        }
      }
      return true;
    });
  };

  const isGeomTypeDisabled = (type) => {
    const newGeomFilter = geometryFilter.includes(type)
      ? geometryFilter
      : [...geometryFilter, type];
    const testArr = applyGeometryAndPropertyFilters(flattenedFeatures, newGeomFilter, propertyFilters);
    return testArr.length === 0;
  };

  const isPropValueDisabled = (key, val) => {
    const newPF = { ...propertyFilters };
    const oldVals = newPF[key] || [];
    if (!oldVals.includes(val)) {
      newPF[key] = [...oldVals, val];
    }
    const testArr = applyGeometryAndPropertyFilters(flattenedFeatures, geometryFilter, newPF);
    return testArr.length === 0;
  };

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
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#fafafa',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Typography style={{ textAlign: 'center', fontFamily: 'Arial' }}>
            No valid GeoJSON data
          </Typography>
        </div>
      ) : (
        <MapContainer
          center={[39.9, 116.4]}
          zoom={5}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          ref={(m) => {
            mapRef.current = m;
          }}
        >
          <ZoomControl position="bottomright" />
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

      {!noData && (
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

          <FormControl component="fieldset" variant="standard" sx={{ mb: 2 }}>
            <FormLabel component="legend" sx={{ fontSize: '0.9rem' }}>
              Geometry Types
            </FormLabel>
            <FormGroup>
              {allGeomTypes.map((type) => {
                const disabled = isGeomTypeDisabled(type);
                return (
                  <FormControlLabel
                    key={type}
                    control={
                      <Checkbox
                        checked={geometryFilter.includes(type)}
                        onChange={() => handleToggleGeomType(type)}
                        disabled={disabled}
                      />
                    }
                    label={type}
                  />
                );
              })}
            </FormGroup>
          </FormControl>

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

          {activeKey && allPropertyValuesMap[activeKey] && (() => {
            const allVals = allPropertyValuesMap[activeKey];
            const allDisabled = allVals.every((val) => isPropValueDisabled(activeKey, val));
            return (
              <FormControl component="fieldset" variant="standard">
                <FormLabel component="legend" sx={{ fontSize: '0.9rem' }}>
                  Values for [{activeKey}]
                </FormLabel>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={
                          activeValues.length > 0 &&
                          activeValues.length === allVals.length
                        }
                        indeterminate={
                          activeValues.length > 0 &&
                          activeValues.length < allVals.length
                        }
                        onChange={(e) => handleSelectAllValues(e.target.checked)}
                        disabled={allDisabled}
                      />
                    }
                    label="(Select All)"
                  />
                  {allVals.map((val) => {
                    const disabled = isPropValueDisabled(activeKey, val);
                    return (
                      <FormControlLabel
                        key={String(val)}
                        control={
                          <Checkbox
                            checked={activeValues.includes(val)}
                            onChange={() => handleToggleValue(val)}
                            disabled={disabled}
                          />
                        }
                        label={String(val)}
                      />
                    );
                  })}
                </FormGroup>
              </FormControl>
            );
          })()}
        </Box>
      )}

      {sortedTimePoints.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 220,
            backgroundColor: 'rgba(255,255,255,0.9)',
            p: 2,
            borderRadius: 2,
            zIndex: 999,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Time-Series
          </Typography>
          <Button variant="contained" onClick={handlePlayPause} sx={{ mb: 1 }}>
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Current: {new Date(currentTime).toLocaleString()}
          </Typography>
          <Slider
            value={currentTime}
            onChange={(e, val) => {
              setCurrentTime(val);
              setIsPlaying(false);
            }}
            min={sortedTimePoints[0]}
            max={sortedTimePoints[sortedTimePoints.length - 1]}
            step={1000}
            valueLabelDisplay="auto"
            marks={sortedTimePoints.map((t) => ({
              value: t,
              label: '',
            }))}
            sx={{
              '& .MuiSlider-mark': {
                backgroundColor: 'white',
                height: 6,
                width: 6,
                borderRadius: '50%',
              },
              '& .MuiSlider-markLabel': {
                display: 'none',
              },
            }}
          />
        </Box>
      )}
    </div>
  );
}

export default TimeSeriesMapViewer;