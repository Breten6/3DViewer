// src/MarkerPopupContent.jsx
import React from 'react';

const MarkerPopupContent = ({
  properties = {},
  coords = null,
  hideCoordinate = false,
}) => {
  // Separate 'time' from other properties
  const { time, ...restProps } = properties;

  const timeValue = (time !== undefined && time !== null) ? time : 'N/A';

  // If coords is an array [lat, lng], use it. Otherwise 'N/A'
  let lat = 'N/A';
  let lng = 'N/A';
  if (Array.isArray(coords) && coords.length >= 2) {
    lat = coords[0];
    lng = coords[1];
  }

  // Convert remaining properties into an array of entries
  const entries = Object.entries(restProps);

  return (
    <div
      style={{
        minWidth: 200,
        maxHeight: 200,
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      {!hideCoordinate && (
        <div>
          <b>Coordinate:</b>{' '}
          {typeof lat === 'number' && typeof lng === 'number'
            ? `${lat}, ${lng}`
            : 'N/A'}
        </div>
      )}

      <div>
        <b>Time:</b> {timeValue}
      </div>
      <hr />

      {entries.length === 0 ? (
        <div><i>No additional properties</i></div>
      ) : (
        <div>
          <b>Properties:</b>
          {entries.map(([key, value]) => {
            // If value is null/undefined => 'N/A'
            if (value == null) {
              return (
                <div key={key} style={{ marginLeft: 8 }}>
                  <b>{key}:</b> N/A
                </div>
              );
            }

            // If value is an object or array => JSON-stringify it
            let displayValue =
              typeof value === 'object' ? JSON.stringify(value) : String(value);

            return (
              <div key={key} style={{ marginLeft: 8 }}>
                <b>{key}:</b> {displayValue}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MarkerPopupContent;