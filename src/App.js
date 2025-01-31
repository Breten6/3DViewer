// src/App.js
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ThreeDViewer from './ThreeDViewer';
import TimeSeriesMapViewer from './TimeSeriesMapViewer';
import './App.css';
import 'leaflet/dist/leaflet.css';

import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Alert,
  Snackbar,
  Drawer,
  IconButton,
  FormControlLabel,
  Switch,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  CircularProgress,
  Tabs,
  Tab,
  Divider,
} from '@mui/material';

import UploadFileIcon from '@mui/icons-material/UploadFile';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';

import { parseFile } from './fileParser';

function ThreeDDrawerContent({
  handleCloseDrawer,
  pointSizePercent,
  handlePointSizeChange,
}) {
  const [sliderValue, setSliderValue] = useState(pointSizePercent);

  useEffect(() => {
    setSliderValue(pointSizePercent);
  }, [pointSizePercent]);

  return (
    <Box sx={{ width: 300, p: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h6">3D Settings</Typography>
        <IconButton onClick={handleCloseDrawer}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography gutterBottom>Points Size</Typography>
        <Slider
          value={sliderValue}
          onChange={(e, newVal) => setSliderValue(newVal)}
          onChangeCommitted={(e, newVal) => {
            handlePointSizeChange(newVal);
          }}
          step={1}
          min={1}
          max={100}
          valueLabelDisplay="auto"
        />
      </Box>

      <Box sx={{ mb: 3 }}>
        <FormControlLabel
          control={
            <Switch
              checked={true}
              disabled
              color="primary"
            />
          }
          label="Color by Altitude"
        />
      </Box>
    </Box>
  );
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 3D point size
  const [pointSizePercent, setPointSizePercent] = useState(50);
  const [maxPointSize, setMaxPointSize] = useState(100);
  const pointSize = useMemo(() => (pointSizePercent / 100) * maxPointSize, [
    pointSizePercent,
    maxPointSize,
  ]);

  const [colorMode] = useState('height'); 
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // 3D Viewer refresh
  const [settingsAppliedCount] = useState(0);

  const pointClouds = useMemo(() => (pointCloud ? [pointCloud] : []), [pointCloud]);

  // switch tabs
  const [tabValue, setTabValue] = useState(0);
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    addLog(`switch to ${newValue === 0 ? '3D Viewer' : 'GIS Map'} tab`, 'info');
  };

  const threeDViewerRef = useRef();

  // handle file parse results
  const handleParseResult = useCallback((data) => {
    const fileSizeKB = (data.size / 1024).toFixed(2);
    if (data.type === 'xyz' || data.type === 'pcd') {
      const { pointCount, boundingBox, points, invalidLines, fileName } = data;
      if (invalidLines > 0) {
        addLog(`File has ${invalidLines} invalid lines => skipping render`, 'error');
        setSnackbarMessage(`Invalid data lines found: ${invalidLines}, skip rendering`);
        setOpenSnackbar(true);
        return;
      }
      if (pointCount === 0) {
        addLog('File has 0 valid points => skipping render', 'error');
        setSnackbarMessage('File has 0 valid points => skip');
        setOpenSnackbar(true);
        return;
      }
      setPointCloud({
        type: 'pointcloud',
        format: data.type.toUpperCase(),
        name: fileName,
        size: fileSizeKB,
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
          size: `${fileSizeKB} KB`,
          pointCount,
          boundingBox: `X:[${boundingBox.minX} ~ ${boundingBox.maxX}] Y:[${boundingBox.minY} ~ ${boundingBox.maxY}] Z:[${boundingBox.minZ} ~ ${boundingBox.maxZ}]`,
        },
      }));
      setLog((prev) => [
        ...prev,
        {
          timestamp: new Date(),
          message: `File uploaded: ${pointCount} points。${
            invalidLines > 0 ? `Ignored ${invalidLines} invalid data` : ''
          }`,
          type: 'info',
        },
      ]);
      addLog(`3D point cloud parsed succesfully: ${fileName},points: ${pointCount}`, 'info');

      // reset point size
      setPointSizePercent(50);
      addLog(`New file uploaded, reset point size to 50%`, 'info');
      // dynamically set point size ajustment range
      const volume =
        (boundingBox.maxX - boundingBox.minX) *
        (boundingBox.maxY - boundingBox.minY) *
        (boundingBox.maxZ - boundingBox.minZ);
      const averageSpacing = Math.pow(volume / pointCount, 1 / 3);
      const scalingFactor = 0.7;
      const estimatedMaxPointSize = Math.min(200, averageSpacing * scalingFactor);
      setMaxPointSize(estimatedMaxPointSize);
      setPointSizePercent((prevPercent) => {
        const currentPointSize = (prevPercent / 100) * estimatedMaxPointSize;
        const newPercent =
          estimatedMaxPointSize !== 0
            ? Math.min(
                prevPercent,
                (currentPointSize / estimatedMaxPointSize) * 100
              )
            : 50;
        return newPercent;
      });

      if (threeDViewerRef.current) {
        threeDViewerRef.current.resetCameraView(boundingBox);
        addLog(`New file uploaded, reset camera`, 'info');
      }
    } else if (data.type === 'geojson') {
      setGeoJSONData({
        name: data.fileName,
        size: fileSizeKB,
        data: data.geoJSON,
      });
      setUploadedFiles((prev) => ({
        ...prev,
        gisData: {
          type: 'GIS Data',
          format: 'GeoJSON',
          name: data.fileName,
          size: `${fileSizeKB} KB`,
          pointCount: 'N/A',
          boundingBox: 'N/A',
        },
      }));
      setLog((prev) => [
        ...prev,
        {
          timestamp: new Date(),
          message: `GIS map file uploaed: ${data.geoJSON.type}`,
          type: 'info',
        },
      ]);
      addLog(`GIS map file parsed: ${data.fileName}`, 'info');
    }
  }, []);

  // ========== 文件上传 ==========
  const handleFileUpload = useCallback(
    (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const fileName = file.name;
      const fileExtension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

      // 根据 tabValue 限制文件类型
      if (tabValue === 0) {
        if (fileExtension !== '.xyz' && fileExtension !== '.pcd') {
          setSnackbarMessage('.xyz or .pcd file only in 3D Viewer');
          setOpenSnackbar(true);
          addLog(`Attemped to upload wrong file type: ${fileName}`, 'warning');
          return;
        }
      } else if (tabValue === 1) {
        if (fileExtension !== '.geojson' && fileExtension !== '.json') {
          setSnackbarMessage('.geojson or .json file only in GIS viewer');
          setOpenSnackbar(true);
          addLog(`Attemped to upload wrong file type: ${fileName}`, 'warning');
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
            1.0
          );
          handleParseResult(result);
          addLog(`Done uploaded and parsed file: ${fileName}`, 'info');
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
    },
    [tabValue, handleParseResult]
  );

  // gis part
  const sortedTimePoints = useMemo(() => {
    const timeSet = new Set();
    if (geoJSONData?.data?.features) {
      geoJSONData.data.features.forEach((feature) => {
        const time = feature.properties?.time;
        if (time) {
          const timeValue =
            typeof time === 'string' ? new Date(time).getTime() : time;
          timeSet.add(timeValue);
        }
      });
    }
    return Array.from(timeSet).sort((a, b) => a - b);
  }, [geoJSONData]);

  const allTimes = useMemo(() => sortedTimePoints, [sortedTimePoints]);
  const minTime = useMemo(
    () => (allTimes.length ? Math.min(...allTimes) : 0),
    [allTimes]
  );
  const maxTime = useMemo(
    () => (allTimes.length ? Math.max(...allTimes) : 0),
    [allTimes]
  );

  const [gisCurrentTime, setGisCurrentTime] = useState(
    sortedTimePoints.length > 0 ? sortedTimePoints[sortedTimePoints.length - 1] : 0
  );

  const [isPlaying, setIsPlaying] = useState(false);

  const [currentTime, setCurrentTime] = useState(
    sortedTimePoints.length > 0 ? sortedTimePoints[sortedTimePoints.length - 1] : 0
  );

  const intervalRef = useRef(null);

  useEffect(() => {
    if (sortedTimePoints.length > 0) {
      const lastTime = sortedTimePoints[sortedTimePoints.length - 1];
      setCurrentTime(lastTime);
      setGisCurrentTime(lastTime);
      // addLog(
      //   `Initiallize : ${new Date(lastTime).toLocaleString()}`,
      //   'info'
      // );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedTimePoints]);

  useEffect(() => {
    if (isPlaying) {
      addLog('Start playing time series', 'info');
      const playInterval = () => {
        const nextTime = sortedTimePoints.find((time) => time > currentTime);
        if (nextTime) {
          addLog(`Played to: ${new Date(nextTime).toLocaleString()}`, 'info');
          setCurrentTime(nextTime);
          setGisCurrentTime(nextTime);
        } else {
          addLog('Time series ended', 'info');
          setIsPlaying(false);
        }
      };
      const intervalId = setInterval(playInterval, 1000);
      intervalRef.current = intervalId;
      return () => clearInterval(intervalId);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        addLog('Paused', 'info');
      }
    }
  }, [isPlaying, sortedTimePoints, currentTime]);

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentTime === sortedTimePoints[sortedTimePoints.length - 1]) {
        setCurrentTime(sortedTimePoints[0]);
        setGisCurrentTime(sortedTimePoints[0]);
        // addLog(
        //   `Reset to start point: ${new Date(
        //     sortedTimePoints[0]
        //   ).toLocaleString()}`,
        //   'info'
        // );
      }
      setIsPlaying(true);
    }
  };

  // Drawer
  const toggleDrawer = () => {
    setDrawerOpen(!drawerOpen);
  };
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
  };

  const handlePointSizeChange = useCallback((newVal) => {
    setPointSizePercent(newVal);
    addLog(`3D Viewer Setting: manually set point size to ${newVal}%`, 'info');
  }, []);

  const renderGISDrawerContent = () => {
    const handleSliderChange = (event, value) => {
      setCurrentTime(value);
      setGisCurrentTime(value);
      setIsPlaying(false);
      addLog(`GIS settings: manually set time to ${new Date(value).toLocaleString()}`, 'info');
    };

    return (
      <Box sx={{ width: 300, p: 2 }}>
        <Typography variant="h6" gutterBottom>
          GIS Settings
        </Typography>

        {sortedTimePoints.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography gutterBottom>Time-Series Animation</Typography>
            <Button variant="contained" onClick={handlePlayPause} sx={{ mb: 2 }}>
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Current time: {new Date(currentTime).toLocaleString()}
            </Typography>
            <Slider
              value={currentTime}
              onChange={handleSliderChange}
              marks={sortedTimePoints.map((time) => ({ value: time, label: '' }))}
              min={minTime}
              max={maxTime}
              step={1000}
              valueLabelDisplay="auto"
              sx={{
                '& .MuiSlider-mark': {
                  backgroundColor: 'white',
                  height: 6.5,
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
      </Box>
    );
  };

  const render3DDrawerContent = () => (
    <ThreeDDrawerContent
      handleCloseDrawer={handleCloseDrawer}
      pointSizePercent={pointSizePercent}
      handlePointSizeChange={handlePointSizeChange}
    />
  );

  const addLog = (message, type = 'info') => {
    setLog((prev) => {
      const newLog = [...prev, { timestamp: new Date(), message, type }];
      if (newLog.length > 100) {
        return newLog.slice(newLog.length - 100);
      }
      return newLog;
    });
    console.log(`[${type.toUpperCase()}] ${new Date().toLocaleString()}: ${message}`);
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        {/* 顶部导航 */}
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              3D Point Cloud & GIS Map Viewer
            </Typography>
            <IconButton color="inherit" onClick={toggleDrawer}>
              <SettingsIcon />
            </IconButton>
          </Toolbar>
        </AppBar>

        {/* 主内容区域 */}
        <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
          {/* 左侧面板 */}
          <Box sx={{ width: 300, bgcolor: '#f5f5f5', p: 2, overflowY: 'auto' }}>
            {/* 上传文件 */}
            <Box sx={{ mb: 4 }}>
              <Button
                variant="contained"
                component="label"
                startIcon={<UploadFileIcon />}
                color="primary"
                fullWidth
                disabled={loading}
                sx={{ fontSize: '13px',marginBottom: -1, marginTop: 0.5}} 
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

            {/* 操作说明 */}
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6" gutterBottom>
              Operating Instructions
              </Typography>
              <Typography variant="body2" color="textSecondary">
                - 3D/GIS Settings can be opened in the right drawer <br />
                - ======== 3D Viewer ======== <br />
                - Right-click and drag to pan the view  <br />
                - Left-click and drag to rotate the view <br />
                - Zoom: mouse wheel<br />
                - ======== GIS Map ======== <br />
                - Using GIS Settings to play the Time-Series Animation <br />
                - Left-click and drag to pan the view  <br />
                - Left-click features to check its infomation <br /> 
                - Zoom: mouse wheel<br />
              </Typography>
            </Box>
          </Box>

          {/* 中间面板：Tabs */}
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            <Tabs
              value={tabValue}
              onChange={handleTabChange}
              indicatorColor="primary"
              textColor="primary"
            >
              <Tab label="3D Point Cloud Viewer" />
              <Tab label="GIS Map Viewer" />
            </Tabs>

            <Box sx={{ flexGrow: 1, position: 'relative' }}>
              {/* 3D Viewer */}
              <Box
                sx={{ display: tabValue === 0 ? 'block' : 'none', width: '100%', height: '100%' }}
              >
                <ThreeDViewer
                  ref={threeDViewerRef}
                  pointClouds={pointClouds}
                  pointSize={pointSize}
                  colorMode={colorMode}
                  settingsAppliedCount={settingsAppliedCount}
                />
                {loading && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <CircularProgress color="inherit" />
                    <Typography variant="h6" sx={{ ml: 2 }}>
                      Loading...
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* GIS Viewer */}
              <Box
                sx={{ display: tabValue === 1 ? 'block' : 'none', width: '100%', height: '100%' }}
              >
                <TimeSeriesMapViewer
                  geoJSONData={geoJSONData}
                  currentTime={currentTime}
                  selectedTags={[]} 
                />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* bottom panel*/}
        <Box sx={{ height: 150, bgcolor: '#f0f0f0', p: 2, overflowY: 'auto' }}>
          {/* file info */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6" gutterBottom>
              Uploaded files info
            </Typography>
            {(!uploadedFiles.pointCloud && !uploadedFiles.gisData) ? (
              <Alert severity="info">No files have been uploaded.</Alert>
            ) : (
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Type</TableCell>
                      <TableCell>Format</TableCell>
                      <TableCell>File Name</TableCell>
                      <TableCell>Size</TableCell>
                      <TableCell>Count</TableCell>
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

          <Divider />

          {/* sys log*/}
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              System Log
            </Typography>
            <Paper
              variant="outlined"
              sx={{ p: 2, height: '200px', overflowY: 'scroll', bgcolor: '#ffffff' }}
            >
              {log.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  There is no log.
                </Typography>
              ) : (
                log.map((entry, index) => {
                  let color;
                  let IconComponent;
                  switch (entry.type) {
                    case 'error':
                      color = 'error.main';
                      IconComponent = require('@mui/icons-material/Error').default;
                      break;
                    case 'warning':
                      color = 'warning.main';
                      IconComponent = require('@mui/icons-material/Warning').default;
                      break;
                    case 'info':
                    default:
                      color = 'text.primary';
                      IconComponent = require('@mui/icons-material/Info').default;
                  }
                  return (
                    <Box
                      key={index}
                      sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}
                    >
                      <IconComponent sx={{ color, mr: 1, fontSize: '1rem' }} />
                      <Typography
                        variant="body2"
                        sx={{ color, whiteSpace: 'pre-wrap' }}
                      >
                        {`${entry.timestamp.toLocaleString()}: ${entry.message}`}
                      </Typography>
                    </Box>
                  );
                })
              )}
            </Paper>
            {/* download log */}
            <Button
              variant="outlined"
              onClick={() => {
                const logText = log
                  .map(
                    (entry) =>
                      `${entry.timestamp.toLocaleString()}: ${entry.message}`
                  )
                  .join('\n');
                const blob = new Blob([logText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'system_log.txt';
                link.click();
                addLog('Download log', 'info');
              }}
              sx={{ mt: 2 }}
            >
              Download
            </Button>
          </Box>
        </Box>

        {/* Drawer, swithc by tab*/}
        <Drawer anchor="right" open={drawerOpen} onClose={handleCloseDrawer}>
          {tabValue === 1
            ? renderGISDrawerContent()
            : render3DDrawerContent()
          }
        </Drawer>

        {/* Snackbar*/}
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