// src/PropertyFilter.jsx
import React, { useMemo } from 'react';
import {
  FormControl,
  FormGroup,
  FormControlLabel,
  Checkbox,
  FormLabel,
  Box,
} from '@mui/material';

const PropertyFilter = ({
  geoJSONData,
  selectedProperties,
  setSelectedProperties,
  addLog,
}) => {
  // Collect all property keys and their possible values
  const properties = useMemo(() => {
    const propMap = {};
    if (geoJSONData?.data?.features) {
      geoJSONData.data.features.forEach((feature) => {
        const props = feature.properties || {};
        Object.keys(props).forEach((key) => {
          if (!propMap[key]) {
            propMap[key] = new Set();
          }
          const value = props[key];
          if (Array.isArray(value)) {
            value.forEach((v) => propMap[key].add(v));
          } else {
            propMap[key].add(value);
          }
        });
      });
    }
    // Convert each set to a sorted array
    const sortedPropMap = {};
    Object.keys(propMap).forEach((key) => {
      sortedPropMap[key] = Array.from(propMap[key]).sort();
    });
    return sortedPropMap;
  }, [geoJSONData]);

  const handlePropertyChange = (property) => (event) => {
    if (event.target.checked) {
      setSelectedProperties((prev) => ({
        ...prev,
        [property]: [],
      }));
      addLog(`Property Filter: selected property "${property}"`, 'info');
    } else {
      setSelectedProperties((prev) => {
        const newProps = { ...prev };
        delete newProps[property];
        return newProps;
      });
      addLog(`Property Filter: unselected property "${property}"`, 'info');
    }
  };

  const handleValueChange = (property, value) => (event) => {
    if (event.target.checked) {
      setSelectedProperties((prev) => ({
        ...prev,
        [property]: [...prev[property], value],
      }));
      addLog(`Property Filter: selected value "${value}" for "${property}"`, 'info');
    } else {
      setSelectedProperties((prev) => ({
        ...prev,
        [property]: prev[property].filter((v) => v !== value),
      }));
      addLog(`Property Filter: unselected value "${value}" for "${property}"`, 'info');
    }
  };

  return (
    <FormControl component="fieldset" variant="standard">
      <FormLabel component="legend">Properties</FormLabel>
      <FormGroup>
        {Object.keys(properties).map((property) => (
          <Box key={property} sx={{ mb: 1 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={property in selectedProperties}
                  onChange={handlePropertyChange(property)}
                  name={property}
                />
              }
              label={property}
            />
            {/* Nested checkboxes, only visible if this property is selected */}
            {property in selectedProperties && (
              <Box sx={{ pl: 3 }}>
                {properties[property].map((value) => (
                  <FormControlLabel
                    key={value}
                    control={
                      <Checkbox
                        checked={
                          selectedProperties[property]?.includes(value) || false
                        }
                        onChange={handleValueChange(property, value)}
                        name={`${property}-${value}`}
                      />
                    }
                    label={String(value)}
                  />
                ))}
              </Box>
            )}
          </Box>
        ))}
      </FormGroup>
    </FormControl>
  );
};

export default PropertyFilter;