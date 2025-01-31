// src/ThreeDViewer.jsx
import React, {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
} from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls';
import { Box, IconButton, Stack } from '@mui/material';
import {
  Add,
  Remove,
  ArrowUpward,
  ArrowDownward,
  ArrowLeft,
  ArrowRight,
  Autorenew,
  CameraAlt,
  GridOn,
  GridOff,
} from '@mui/icons-material';

const ThreeDViewer = forwardRef(
  ({ pointClouds, pointSize, colorMode, settingsAppliedCount }, ref) => {
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const controlsRef = useRef(null);
    const pointCloudRef = useRef(null);

    // Axes/Grid references
    const axesHelperRef = useRef(null);
    const gridHelperRef = useRef(null);

    // Show/hide axes & grid
    const [showAxesGrid, setShowAxesGrid] = useState(true);

    // For manual pan/zoom
    const isPanActiveRef = useRef({ up: false, down: false, left: false, right: false });
    const isZoomActiveRef = useRef({ in: false, out: false });

    // === 1. Initialize Scene ===
    useEffect(() => {
      const container = mountRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1e1e1e);
      sceneRef.current = scene;

      // Axes + Grid
      const axesHelper = new THREE.AxesHelper(100000);
      scene.add(axesHelper);
      axesHelperRef.current = axesHelper;

      const gridHelper = new THREE.GridHelper(200, 50, 0x444444, 0x444444);
      scene.add(gridHelper);
      gridHelperRef.current = gridHelper;

      // Lights
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(100, 100, 100);
      scene.add(directionalLight);

      // Camera
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1,1e7);
      camera.position.set(100, 100, 100);
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Controls
      const controls = new TrackballControls(camera, renderer.domElement);
      controls.rotateSpeed = 4.0;
      controls.zoomSpeed = 1.2;
      controls.panSpeed = 0.8;
      controls.staticMoving = false;
      controls.dynamicDampingFactor = 0.2;
      controlsRef.current = controls;

      // Handle resize
      const handleResize = () => {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        renderer.setSize(newWidth, newHeight);
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
      };
      window.addEventListener('resize', handleResize);

      // Animation loop
      const animate = () => {
        requestAnimationFrame(animate);

        const distance = camera.position.distanceTo(controls.target);
        const moveStep = distance * 0.01;

        // Pan
        if (isPanActiveRef.current.up) {
          camera.position.y += moveStep;
          controls.target.y += moveStep;
        }
        if (isPanActiveRef.current.down) {
          camera.position.y -= moveStep;
          controls.target.y -= moveStep;
        }
        if (isPanActiveRef.current.left) {
          camera.position.x -= moveStep;
          controls.target.x -= moveStep;
        }
        if (isPanActiveRef.current.right) {
          camera.position.x += moveStep;
          controls.target.x += moveStep;
        }

        // Zoom
        if (isZoomActiveRef.current.in) {
          const factor = 0.98;
          const direction = camera.position.clone().sub(controls.target);
          direction.multiplyScalar(factor);
          camera.position.copy(controls.target.clone().add(direction));
        }
        if (isZoomActiveRef.current.out) {
          const factor = 1.02;
          const direction = camera.position.clone().sub(controls.target);
          direction.multiplyScalar(factor);
          camera.position.copy(controls.target.clone().add(direction));
        }

        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize);
        renderer.dispose();
        controls.dispose();
        scene.remove(axesHelper);
        scene.remove(gridHelper);
        scene.remove(ambientLight);
        scene.remove(directionalLight);

        if (pointCloudRef.current) {
          scene.remove(pointCloudRef.current);
          pointCloudRef.current.geometry.dispose();
          pointCloudRef.current.material.dispose();
        }
        container.removeChild(renderer.domElement);
      };
    }, []);

    // === 2. Toggle axes & grid ===
    useEffect(() => {
      if (axesHelperRef.current) {
        axesHelperRef.current.visible = showAxesGrid;
      }
      if (gridHelperRef.current) {
        gridHelperRef.current.visible = showAxesGrid;
      }
    }, [showAxesGrid]);

    // === 3. Render point cloud ===
    const renderPointCloud = useCallback(
      (pc) => {
        if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

        // Remove old
        const scene = sceneRef.current;
        if (pointCloudRef.current) {
          scene.remove(pointCloudRef.current);
          pointCloudRef.current.geometry.dispose();
          pointCloudRef.current.material.dispose();
          pointCloudRef.current = null;
        }

        // ====== 新增: invalidLines 或 point 数量检查 ======
        const invalidLines = pc.invalidLines || 0;
        const points = pc.points || [];
        if (invalidLines > 0) {
          console.error(
            `Point cloud "${pc.name}" has ${invalidLines} invalid lines. Skipping render.`
          );
          return;
        }
        if (points.length === 0) {
          console.error(`Point cloud "${pc.name}" has 0 valid points. Skipping render.`);
          return;
        }
        // ====== 检查结束，以下保持原样 ======

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(points.length * 3);
        const colors = new Float32Array(points.length * 3);

        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          positions[i * 3 + 0] = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;

          if (
            colorMode === 'rgb' &&
            p.r !== undefined &&
            p.g !== undefined &&
            p.b !== undefined
          ) {
            colors[i * 3 + 0] = p.r / 255;
            colors[i * 3 + 1] = p.g / 255;
            colors[i * 3 + 2] = p.b / 255;
          } else if (colorMode === 'intensity' && p.intensity !== undefined) {
            const t = p.intensity / 255;
            colors[i * 3 + 0] = t;
            colors[i * 3 + 1] = t;
            colors[i * 3 + 2] = t;
          } else if (colorMode === 'height') {
            const dy = pc.boundingBox.maxY - pc.boundingBox.minY || 1;
            const ratio = (p.y - pc.boundingBox.minY) / dy;
            const c = new THREE.Color().setHSL(0.7 - 0.7 * ratio, 1.0, 0.5);
            colors[i * 3 + 0] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
          } else {
            // default gray
            colors[i * 3 + 0] = 0.8;
            colors[i * 3 + 1] = 0.8;
            colors[i * 3 + 2] = 0.8;
          }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
          size: pointSize,
          vertexColors: true,
          sizeAttenuation: true,
        });

        const pointCloudObj = new THREE.Points(geometry, material);
        scene.add(pointCloudObj);
        pointCloudRef.current = pointCloudObj;

        // Center
        const centerX = (pc.boundingBox.minX + pc.boundingBox.maxX) / 2;
        const centerY = (pc.boundingBox.minY + pc.boundingBox.maxY) / 2;
        const centerZ = (pc.boundingBox.minZ + pc.boundingBox.maxZ) / 2;
        pointCloudObj.position.set(-centerX, -centerY, -centerZ);

        console.log(
          `Rendered point cloud "${pc.name}", total points: ${points.length}`
        );
      },
      [colorMode, pointSize]
    );

    // === 4. Reset camera ===
    const resetCameraView = useCallback((boundingBox) => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls || !boundingBox) return;

      const sizeX = boundingBox.maxX - boundingBox.minX;
      const sizeY = boundingBox.maxY - boundingBox.minY;
      const sizeZ = boundingBox.maxZ - boundingBox.minZ;
      const maxDim = Math.max(sizeX, sizeY, sizeZ);

      const fov = camera.fov * (Math.PI / 180);
      let camDist = Math.abs(maxDim / 2 / Math.tan(fov / 2));
      camDist *= 1.5;
      const maxAllowedCamDist = 10000;

      camDist = Math.min(camDist, maxAllowedCamDist);
      camera.up.set(0, 1, 0);
      camera.position.set(camDist, camDist, camDist);
      camera.lookAt(0, 0, 0);

      controls.target.set(0, 0, 0);
      controls.update();
    }, []);

    // === 5. Take screenshot ===
    const takeScreenshot = useCallback(() => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return;

      renderer.render(scene, camera);
      const dataURL = renderer.domElement.toDataURL('image/png');

      const link = document.createElement('a');
      link.href = dataURL;
      link.download = '3d_view.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }, []);

    // Expose to parent
    useImperativeHandle(ref, () => ({
      resetCameraView,
      takeScreenshot,
    }));

    // When pointSize changes, update material
    useEffect(() => {
      if (pointCloudRef.current && pointCloudRef.current.material) {
        pointCloudRef.current.material.size = pointSize;
        pointCloudRef.current.material.needsUpdate = true;
      }
    }, [pointSize]);

    // Re-render on pointClouds / settingsAppliedCount changes
    useEffect(() => {
      if (pointClouds && pointClouds.length > 0) {
        renderPointCloud(pointClouds[0]);
        // resetCameraView(pointClouds[0].boundingBox);
      } else {
        // Clear
        if (pointCloudRef.current && sceneRef.current) {
          sceneRef.current.remove(pointCloudRef.current);
          pointCloudRef.current.geometry.dispose();
          pointCloudRef.current.material.dispose();
          pointCloudRef.current = null;
        }
      }
    }, [pointClouds, renderPointCloud, settingsAppliedCount]);

    // "Reset Camera" button
    const handleResetCamera = useCallback(() => {
      if (pointClouds[0]?.boundingBox) {
        resetCameraView(pointClouds[0].boundingBox);
      }
    }, [pointClouds, resetCameraView]);

    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <Box
          ref={mountRef}
          sx={{ width: '100%', height: '100%', backgroundColor: '#1e1e1e' }}
        />

        {/* Overlaid buttons */}
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            backgroundColor: 'rgba(255,255,255,0.1)',
            p: 1,
            borderRadius: 1,
          }}
        >
          {/* Reset Camera */}
          <IconButton
            size="small"
            onClick={handleResetCamera}
            title="Reset Camera"
            sx={{ color: '#fff' }}
          >
            <Autorenew fontSize="inherit" />
          </IconButton>

          {/* Zoom In */}
          <IconButton
            size="small"
            title="Zoom In"
            sx={{ color: '#fff' }}
            onMouseDown={() => {
              isZoomActiveRef.current.in = true;
            }}
            onMouseUp={() => {
              isZoomActiveRef.current.in = false;
            }}
            onMouseLeave={() => {
              isZoomActiveRef.current.in = false;
            }}
          >
            <Add fontSize="inherit" />
          </IconButton>

          {/* Zoom Out */}
          <IconButton
            size="small"
            title="Zoom Out"
            sx={{ color: '#fff' }}
            onMouseDown={() => {
              isZoomActiveRef.current.out = true;
            }}
            onMouseUp={() => {
              isZoomActiveRef.current.out = false;
            }}
            onMouseLeave={() => {
              isZoomActiveRef.current.out = false;
            }}
          >
            <Remove fontSize="inherit" />
          </IconButton>

          {/* Pan Up / Down */}
          <Stack direction="row" justifyContent="space-between">
            <IconButton
              size="small"
              title="Pan Up"
              sx={{ color: '#fff' }}
              onMouseDown={() => {
                isPanActiveRef.current.up = true;
              }}
              onMouseUp={() => {
                isPanActiveRef.current.up = false;
              }}
              onMouseLeave={() => {
                isPanActiveRef.current.up = false;
              }}
            >
              <ArrowUpward fontSize="inherit" />
            </IconButton>
            <IconButton
              size="small"
              title="Pan Down"
              sx={{ color: '#fff' }}
              onMouseDown={() => {
                isPanActiveRef.current.down = true;
              }}
              onMouseUp={() => {
                isPanActiveRef.current.down = false;
              }}
              onMouseLeave={() => {
                isPanActiveRef.current.down = false;
              }}
            >
              <ArrowDownward fontSize="inherit" />
            </IconButton>
          </Stack>

          {/* Pan Left / Right */}
          <Stack direction="row" justifyContent="space-between">
            <IconButton
              size="small"
              title="Pan Left"
              sx={{ color: '#fff' }}
              onMouseDown={() => {
                isPanActiveRef.current.left = true;
              }}
              onMouseUp={() => {
                isPanActiveRef.current.left = false;
              }}
              onMouseLeave={() => {
                isPanActiveRef.current.left = false;
              }}
            >
              <ArrowLeft fontSize="inherit" />
            </IconButton>
            <IconButton
              size="small"
              title="Pan Right"
              sx={{ color: '#fff' }}
              onMouseDown={() => {
                isPanActiveRef.current.right = true;
              }}
              onMouseUp={() => {
                isPanActiveRef.current.right = false;
              }}
              onMouseLeave={() => {
                isPanActiveRef.current.right = false;
              }}
            >
              <ArrowRight fontSize="inherit" />
            </IconButton>
          </Stack>

          {/* Take screenshot */}
          <IconButton
            size="small"
            title="Take Screenshot"
            sx={{ color: '#fff' }}
            onClick={takeScreenshot}
          >
            <CameraAlt fontSize="inherit" />
          </IconButton>

          {/* Toggle Axes/Grid */}
          <IconButton
            size="small"
            title={showAxesGrid ? 'Hide Axes/Grid' : 'Show Axes/Grid'}
            sx={{ color: '#fff' }}
            onClick={() => setShowAxesGrid((prev) => !prev)}
          >
            {showAxesGrid ? <GridOff fontSize="inherit" /> : <GridOn fontSize="inherit" />}
          </IconButton>
        </Box>
      </Box>
    );
  }
);

export default React.memo(ThreeDViewer);