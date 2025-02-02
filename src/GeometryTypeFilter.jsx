// src/GeometryTypeFilter.jsx
import React, { useMemo } from 'react';
import {
  FormControl,
  FormGroup,
  FormControlLabel,
  Checkbox,
} from '@mui/material';


const GeometryTypeFilter = ({ geoJSONData, selectedGeometryTypes, setSelectedGeometryTypes, addLog }) => {
  const geometryTypes = useMemo(() => {
    const typeSet = new Set();
    if (geoJSONData?.data?.features) {
      geoJSONData.data.features.forEach((feature) => {
        if (feature.geometry && feature.geometry.type) {
          typeSet.add(feature.geometry.type);
        }
      });
    }
    return Array.from(typeSet).sort();
  }, [geoJSONData]);

  const handleGeometryTypeChange = (type) => (event) => {
    if (event.target.checked) {
      setSelectedGeometryTypes((prev) => [...prev, type]);
      addLog(`Geometry type filter: select ${type}`, 'info');
    } else {
      setSelectedGeometryTypes((prev) =>
        prev.filter((t) => t !== type)
      );
      addLog(`Geometry type filter: cancel select ${type}`, 'info');
    }
  };

  const handleSelectAllChange = (event) => {
    if (event.target.checked) {
      setSelectedGeometryTypes(geometryTypes);
      addLog(`Geometry type filter: select all`, 'info');
    } else {
      setSelectedGeometryTypes([]);
      addLog(`Geometry type filter: select all`, 'info');
    }
  };

  const allSelected =
    selectedGeometryTypes.length === geometryTypes.length && geometryTypes.length > 0;
  const indeterminate =
    selectedGeometryTypes.length > 0 &&
    selectedGeometryTypes.length < geometryTypes.length;

  return (
    <FormControl component="fieldset" variant="standard">
      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              checked={allSelected}
              indeterminate={indeterminate}
              onChange={handleSelectAllChange}
              name="selectAllGeometryTypes"
            />
          }
          label="Select All"
        />
        {geometryTypes.map((type) => (
          <FormControlLabel
            key={type}
            control={
              <Checkbox
                checked={selectedGeometryTypes.includes(type)}
                onChange={handleGeometryTypeChange(type)}
                name={type}
              />
            }
            label={type}
          />
        ))}
      </FormGroup>
    </FormControl>
  );
};

export default GeometryTypeFilter;
