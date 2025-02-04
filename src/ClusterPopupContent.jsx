import React, { useState, useEffect, useRef } from 'react';

const ClusterPopupContent = ({
  leaves,
  count,
  maxMarkers = 10,
  maxHeight = 300,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const scrollContainerRef = useRef(null);
  
  // get total page number
  const totalPages = Math.ceil(leaves.length / maxMarkers);
  
  // current page display
  const displayedLeaves = leaves.slice(
    (currentPage - 1) * maxMarkers,
    currentPage * maxMarkers
  );

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentPage]);

  // page buttons
  const handlePrevPage = (e) => {
    e.stopPropagation();
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = (e) => {
    e.stopPropagation();
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  return (
    <div style={{ minWidth: 220 }}>
      <h4>Cluster ({count} markers)</h4>

      <div
        ref={scrollContainerRef}
        style={{
          maxHeight: `${maxHeight}px`,
          overflowY: 'auto',
          border: '1px solid #ccc',
          padding: '4px',
          marginBottom: '6px',
        }}
      >
        {displayedLeaves.map((marker, i) => {
          const properties = marker.properties || {};
          const geometry = marker.geometry || {};
          
          let lat = 'N/A', lng = 'N/A';
          if (
            geometry.type === 'Point' &&
            Array.isArray(geometry.coordinates)
          ) {
            [lng, lat] = geometry.coordinates;
          }

          const { time, ...restProps } = properties;
          const timeValue = time != null ? time : 'N/A';

          const mappedProps = Object.entries(restProps).map(([k, v]) => {
            let displayVal =
              v == null
                ? 'N/A'
                : typeof v === 'object'
                ? JSON.stringify(v)
                : String(v);

            if (displayVal.length > 200) {
              displayVal = displayVal.slice(0, 200) + '...';
            }

            if (displayVal === 'N/A') return null;

            return (
              <div key={k} style={{ marginLeft: 6 }}>
                <b>{k}:</b> {displayVal}
              </div>
            );
          });

          const filteredProps = mappedProps.filter(Boolean);

          return (
            <div
              key={i}
              style={{
                marginBottom: 8,
                paddingBottom: 4,
                borderBottom: '1px dashed #ccc',
              }}
            >
              {typeof lat === 'number' && typeof lng === 'number' && (
                <div>
                  <b>Coordinate:</b> {`${lat}, ${lng}`}
                </div>
              )}

              {timeValue !== 'N/A' && (
                <div>
                  <b>Time:</b> {timeValue}
                </div>
              )}

              <div style={{ marginLeft: 6, marginTop: 4 }}>
                <b>Properties:</b>
                {filteredProps.length === 0 ? (
                  <div style={{ marginLeft: 6 }}>
                    <i>No more props</i>
                  </div>
                ) : (
                  filteredProps
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* paging control */}
      {totalPages > 1 && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={handlePrevPage} disabled={currentPage === 1}>
            Prev
          </button>
          <span style={{ margin: '0 8px' }}>
            Page {currentPage} / Total {totalPages}
          </span>
          <button onClick={handleNextPage} disabled={currentPage === totalPages}>
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default ClusterPopupContent;