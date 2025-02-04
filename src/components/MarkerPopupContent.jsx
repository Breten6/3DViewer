import React from 'react';

const MarkerPopupContent = ({
  properties = {},
  coords = null,
  hideCoordinate = false,
}) => {
  // Separate 'time' from other properties
  const { time, ...restProps } = properties;
  const timeValue = time != null ? time : 'N/A';

  let lat = 'N/A';
  let lng = 'N/A';
  if (Array.isArray(coords) && coords.length >= 2) {
    lat = coords[0];
    lng = coords[1];
  }

  const entries = Object.entries(restProps);

  const mappedProps = entries.map(([key, value]) => {
    if (value == null) {
      return null;
    }

    let displayValue =
      typeof value === 'object' ? JSON.stringify(value) : String(value);

    if (displayValue === 'N/A') {
      return null;
    }

    return (
      <div key={key} style={{ marginLeft: 8 }}>
        <b>{key}:</b> {displayValue}
      </div>
    );
  });

  const filteredProps = mappedProps.filter(Boolean);

  return (
    <div
      style={{
        minWidth: 200,
        maxHeight: 200,
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      {!hideCoordinate && typeof lat === 'number' && typeof lng === 'number' && (
        <div>
          <b>Coordinate:</b> {`${lat}, ${lng}`}
        </div>
      )}

      {timeValue !== 'N/A' && (
        <div>
          <b>Time:</b> {timeValue}
        </div>
      )}

      <hr />

      {filteredProps.length === 0 ? (
        <div>
          <i>No additional properties</i>
        </div>
      ) : (
        <div>
          <b>Properties:</b>
          {filteredProps}
        </div>
      )}
    </div>
  );
};

export default MarkerPopupContent;