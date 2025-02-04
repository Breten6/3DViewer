// src/App.js
import React, { useState, useCallback, useRef } from 'react';
import ThreeDViewer from './ThreeDViewer';
import TimeSeriesMapViewer from './TimeSeriesMapViewer';
import './style/App.css';
import 'leaflet/dist/leaflet.css';

import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Alert,
  Snackbar,
  LinearProgress,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material';

import UploadFileIcon from '@mui/icons-material/UploadFile';

import { parseFile } from './fileParser';

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return bytes + ' B';
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(2) + ' KB';
  } else if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  } else {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
}

function App() {
  const [pointCloud, setPointCloud] = useState(null);
  const [geoJSONData, setGeoJSONData] = useState(null);

  const [uploadedFiles, setUploadedFiles] = useState({
    pointCloud: null,
    gisData: null,
  });

  const [log, setLog] = useState([]);
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Tabs
  const [tabValue, setTabValue] = useState(0);
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    addLog(`Switch tab to: ${newValue === 0 ? '3D Viewer' : 'GIS Map'}`, 'info');
  };

  const threeDViewerRef = useRef();

  const addLog = useCallback((message, type = 'info') => {
    setLog((prev) => {
      const newLog = [...prev, { timestamp: new Date(), message, type }];
      if (newLog.length > 100) {
        return newLog.slice(newLog.length - 100);
      }
      return newLog;
    });
    console.log(`[${type.toUpperCase()}] ${new Date().toLocaleString()}: ${message}`);
  }, []);

  const handleParseResult = useCallback((data) => {
    const ext = data.fileName.slice(data.fileName.lastIndexOf('.')).toLowerCase();
    const niceSize = formatFileSize(data.size);

    // xyz / pcd => 3D point cloud
    if (data.type === 'xyz' || data.type === 'pcd') {
      const { pointCount, boundingBox, points, invalidLines, fileName } = data;
      if ((pointCount - invalidLines) === 0) {
        addLog(`File has no valid lines => skip`, 'error');
        setSnackbarMessage(`Invalid data lines found: ${invalidLines}, skip rendering`);
        setOpenSnackbar(true);
        return;
      }
      if (pointCount === 0) {
        addLog('File has 0 valid points => skip', 'error');
        setSnackbarMessage('File has 0 valid points => skip');
        setOpenSnackbar(true);
        return;
      }

      setPointCloud({
        type: 'pointcloud',
        format: data.type.toUpperCase(), // "XYZ" or "PCD"
        name: fileName,
        size: niceSize,
        points,
        pointCount,
        boundingBox,
      });

      setUploadedFiles((prev) => ({
        ...prev,
        pointCloud: {
          type: 'Point Cloud',
          format: data.type.toUpperCase(),
          name: fileName,
          size: niceSize,
          pointCount,
          boundingBox: `X:[${boundingBox.minX} ~ ${boundingBox.maxX}] Y:[${boundingBox.minY} ~ ${boundingBox.maxY}] Z:[${boundingBox.minZ} ~ ${boundingBox.maxZ}]`,
        },
      }));

      addLog(
        `File uploaded: ${pointCount} points. ${
          invalidLines > 0 ? `Ignored ${invalidLines} invalid lines` : ''
        }`,
        'info'
      );
      addLog(`3D point cloud parsed successfully: ${fileName}, points: ${pointCount}`, 'info');

      if (threeDViewerRef.current) {
        threeDViewerRef.current.resetCameraView(boundingBox);
        addLog(`Reset 3D camera after new file upload`, 'info');
      }
    }
    // geojson / json => GIS
    else if (data.type === 'geojson') {
      let gisFormat = 'GeoJSON';
      if (ext === '.json') {
        gisFormat = 'JSON';
      }

      setGeoJSONData({
        name: data.fileName,
        size: niceSize,
        data: data.geoJSON,
      });
      setUploadedFiles((prev) => ({
        ...prev,
        gisData: {
          type: 'GIS Data',
          format: gisFormat, // GeoJSON or JSON
          name: data.fileName,
          size: niceSize,
          pointCount: 'N/A',
          boundingBox: 'N/A',
        },
      }));
      addLog(`GIS map file uploaded: ${data.geoJSON.type}`, 'info');
      addLog(`GIS map file parsed: ${data.fileName}`, 'info');
    }
  }, [addLog]);

  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name;
    const fileExtension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

    // Tab 0 => only accept .xyz, .pcd
    if (tabValue === 0) {
      if (fileExtension !== '.xyz' && fileExtension !== '.pcd') {
        setSnackbarMessage('.xyz or .pcd file only for 3D viewer');
        setOpenSnackbar(true);
        addLog(`Attempted to upload wrong file type: ${fileName}`, 'warning');
        return;
      }
    } 
    // Tab 1 => only accept .geojson, .json
    else if (tabValue === 1) {
      if (fileExtension !== '.geojson' && fileExtension !== '.json') {
        setSnackbarMessage('.geojson or .json file only for GIS viewer');
        setOpenSnackbar(true);
        addLog(`Attempted to upload wrong file type: ${fileName}`, 'warning');
        return;
      }
    }

    setLoading(true);
    setProgress(0);
    addLog(`Uploading file: ${fileName}`, 'info');

    const reader = new FileReader();
    reader.onerror = () => {
      setSnackbarMessage('File upload failed');
      setOpenSnackbar(true);
      setLoading(false);
      addLog(`File upload failed: ${fileName}`, 'error');
    };

    reader.onload = async (e) => {
      const fileData = e.target.result;
      try {
        const result = await parseFile(
          fileExtension,
          fileData,
          fileName,
          (p) => setProgress(p),
          1.0,
          file.size
        );
        handleParseResult(result);
        addLog(`Done uploading and parsing: ${fileName}`, 'info');
      } catch (error) {
        console.error('File parsing error:', error);
        setSnackbarMessage(`File parsing failed: ${error}`);
        setOpenSnackbar(true);
        addLog(`File parsing failed: ${fileName}, error: ${error}`, 'error');
      } finally {
        setLoading(false);
        setProgress(100);
      }
    };

    if (fileExtension === '.pcd') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  }, [tabValue, addLog, handleParseResult]);

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar position="static" sx={{ backgroundColor: 'black' }}>
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              3D Point Cloud & GIS Map Viewer
            </Typography>
          </Toolbar>
        </AppBar>

        <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden', minHeight: 0  }}>
          {/* Left side panel */}
          <Box sx={{ width: 300, bgcolor: '#f5f5f5', p: 2, overflowY: 'auto', position: 'relative' }}>
            <Box sx={{ mb: 4 }}>
              <Button
                variant="contained"
                component="label"
                startIcon={<UploadFileIcon />}
                color="primary"
                fullWidth
                disabled={loading}
                sx={{ fontSize: '13px', marginBottom: -1, marginTop: 0.5,backgroundColor: 'black'  }}
              >
                {tabValue === 0
                  ? 'Upload .xyz or .pcd file'
                  : 'Upload .geojson or .json file'}
                <input
                  type="file"
                  accept={tabValue === 0 ? '.xyz,.pcd' : '.geojson,.json'}
                  hidden
                  onChange={handleFileUpload}
                />
              </Button>
              {loading && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress variant="determinate" value={progress} />
                  <Typography variant="body2" color="textSecondary">
                    Loading... {Math.round(progress)}%
                  </Typography>
                </Box>
              )}
            </Box>

            <Divider />

            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
                Operating Instructions
              </Typography>
              <Typography variant="body2" color="textSecondary">
                ======== 3D Viewer ======== <br /><br />
                1. Right-click & drag => pan <br />
                2. Left-click & drag => rotate <br />
                3. Mouse wheel => zoom <br /><br />
                ======== GIS Map ======== <br /><br />
                1. Mouse wheel => zoom <br />
                2. Left-click & drag => pan <br />
                3. Time-series animation is available if "time" data is in GeoJSON (controls top-right on the map) <br /><br />
              </Typography>
            </Box>

            <Box sx={{ position: 'absolute', bottom: 10, left: 10, right: 10 }}>
              <Button
                variant="outlined"
                color="secondary"
                onClick={() => {
                  addLog('Open Dropbox sample data link', 'info');
                  window.open(
                    'https://www.dropbox.com/scl/fi/uqazu1ipdp0ulcihm7cit/dataset.zip?rlkey=o6smsbnhod9z4szifyqfg1ev5&st=d1xj4e7b&dl=0',
                    '_blank'
                  );
                }}
                fullWidth
              >
                View Sample Data on Dropbox
              </Button>
            </Box>
          </Box>

          {/* Right side: Tab content */}
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              sx={{
                "& .MuiTabs-indicator": {
                  backgroundColor: "black"
                },
                "& .MuiTab-root": {
                  color: "black",
                  "&.Mui-selected": {
                    color: "black"
                  }
                }
              }}
            >
              <Tab label="3D Point Cloud Viewer" />
              <Tab label="GIS Map Viewer" />
            </Tabs>

            <Box sx={{ flexGrow: 1, position: 'relative' }}>
              {/* Keep 3DViewer mounted, just hide/show via display */}
              <Box
                sx={{
                  display: tabValue === 0 ? 'block' : 'none',
                  width: '100%',
                  height: '100%',
                }}
              >
                <ThreeDViewer
                  ref={threeDViewerRef}
                  pointClouds={pointCloud ? [pointCloud] : []}
                  colorMode="height"
                  settingsAppliedCount={0}
                />
                {loading && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%,-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'white',
                    }}
                  >
                    <CircularProgress color="inherit" />
                    <Typography variant="h6" sx={{ ml: 2 }}>
                      Loading...
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Keep GIS MapViewer mounted, just hide/show via display */}
              <Box
                sx={{
                  display: tabValue === 1 ? 'block' : 'none',
                  width: '100%',
                  height: '100%',
                }}
              >
                <TimeSeriesMapViewer
                  geoJSONData={geoJSONData}
                  selectedTags={[]}
                />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Uploaded files info */}
        <Box sx={{ height: 150, bgcolor: '#f0f0f0', p: 2, overflowY: 'auto' }}>
          <Typography variant="h6" gutterBottom>
            Uploaded files info
          </Typography>
          {(!uploadedFiles.pointCloud && !uploadedFiles.gisData) ? (
            <Alert severity="info"   sx={{ 
              backgroundColor: 'rgba(245,245,245,0.8)',
              color: 'black' 
            }}>No files have been uploaded.</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Format</TableCell>
                    <TableCell>File Name</TableCell>
                    <TableCell>Size</TableCell>
                    <TableCell>Number of Points</TableCell>
                    <TableCell>Bounding box</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {uploadedFiles.pointCloud && (
                    <TableRow>
                      <TableCell>{uploadedFiles.pointCloud.type}</TableCell>
                      <TableCell>{uploadedFiles.pointCloud.format}</TableCell>
                      <TableCell>{uploadedFiles.pointCloud.name}</TableCell>
                      <TableCell>{uploadedFiles.pointCloud.size}</TableCell>
                      <TableCell>{uploadedFiles.pointCloud.pointCount}</TableCell>
                      <TableCell>{uploadedFiles.pointCloud.boundingBox}</TableCell>
                    </TableRow>
                  )}
                  {uploadedFiles.gisData && (
                    <TableRow>
                      <TableCell>{uploadedFiles.gisData.type}</TableCell>
                      <TableCell>{uploadedFiles.gisData.format}</TableCell>
                      <TableCell>{uploadedFiles.gisData.name}</TableCell>
                      <TableCell>{uploadedFiles.gisData.size}</TableCell>
                      <TableCell>{uploadedFiles.gisData.pointCount}</TableCell>
                      <TableCell>{uploadedFiles.gisData.boundingBox}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>

        <Snackbar
          open={openSnackbar}
          autoHideDuration={6000}
          onClose={() => setOpenSnackbar(false)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity="warning"
            onClose={() => setOpenSnackbar(false)}
            sx={{ width: '100%' }}
          >
            {snackbarMessage}
          </Alert>
        </Snackbar>
      </Box>
    </>
  );
}

export default App;