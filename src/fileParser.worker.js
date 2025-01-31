// src/fileParser.worker.js
/* eslint-disable no-restricted-globals */
import lzf from 'lzfjs';

self.onmessage = function (e) {
  const { fileType, arrayBuffer, text, fileName, size } = e.data;
  console.log('Worker received message:', e.data);

  try {
    let result = null;

    if (fileType === '.pcd' && arrayBuffer) {
      result = parsePCD(arrayBuffer, fileName, size);
    } else if (fileType === '.xyz' && text) {
      result = parseXYZ(text, fileName, size);
    } else if ((fileType === '.geojson' || fileType === '.json') && text) {
      result = parseGeoJSON(text, fileName, size);
    } else {
      throw new Error(`Unsupported file type or data mismatch: ${fileType}`);
    }

    // success
    self.postMessage({ success: true, data: result });
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({ success: false, error: error.message });
  }
};

// parseXYZ - send progress
function parseXYZ(xyzText, fileName, size) {
  console.log('Parsing .xyz file');
  const lines = xyzText.split(/\r?\n/).filter(line => line.trim() !== '');
  const points = [];
  let invalidLines = 0;

  const total = lines.length;
  lines.forEach((line, index) => {
    if (index % 5000 === 0) {
      const percent = Math.floor((index / total) * 100);
      self.postMessage({ progress: percent });
    }

    const parts = line.trim().split(/[\s,]+/);
    if (parts.length < 3) {
      invalidLines++;
      return;
    }
    const [xStr, yStr, zStr] = parts;
    const x = parseFloat(xStr);
    const y = parseFloat(yStr);
    const z = parseFloat(zStr);
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
      invalidLines++;
      return;
    }
    points.push({ x, y, z });
  });

  // Parsing complete
  self.postMessage({ progress: 100 });

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  });

  return {
    type: 'xyz',
    fileName,
    size,
    pointCount: points.length,
    boundingBox: { minX, minY, minZ, maxX, maxY, maxZ },
    points,
    invalidLines,
  };
}

function parseGeoJSON(jsonText, fileName, size) {
  console.log('Parsing GeoJSON');
  const geoJSON = JSON.parse(jsonText);
  if (!geoJSON.type || (geoJSON.type !== 'FeatureCollection' && geoJSON.type !== 'Feature')) {
    throw new Error('Invalid GeoJSON format');
  }
  return {
    type: 'geojson',
    fileName,
    size,
    geoJSON,
  };
}

// ============ parsePCD =============
function parsePCD(arrayBuffer, fileName, size) {
  console.log('Parsing .pcd file with ArrayBuffer');

  const textDecoder = new TextDecoder();
  const headerText = textDecoder.decode(arrayBuffer);
  const lines = headerText.split(/\r?\n/);
  const header = {};
  let dataStartLineIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('DATA')) {
      const parts = line.split(/\s+/);
      header.DATA = parts[1] || 'ascii';
      dataStartLineIndex = i + 1;
      break;
    }
    const [key, ...rest] = line.split(/\s+/);
    header[key] = rest.join(' ');
  }
  if (!header.DATA) {
    header.DATA = 'ascii';
  }

  const dataFormat = header.DATA.toLowerCase();
  const fields = (header.FIELDS || '').split(/\s+/);
  const sizes = (header.SIZE || '').split(/\s+/).map(Number);
  const types = (header.TYPE || '').split(/\s+/);
  const counts = (header.COUNT || '').split(/\s+/).map(Number);
  const numPoints = parseInt(header.POINTS || '0', 10);

  // Calculate header byte size
  let headerByteSize = 0;
  {
    let linesCount = 0;
    let byteCursor = 0;
    while (linesCount < dataStartLineIndex && byteCursor < headerText.length) {
      if (headerText[byteCursor] === '\n') {
        linesCount++;
      }
      byteCursor++;
    }
    headerByteSize = byteCursor;
  }

  let points = [];
  let invalidLines = 0;
  if (dataFormat === 'ascii') {
    const result = parsePCD_ASCII(arrayBuffer, headerByteSize, numPoints);
    points = result.points;
    invalidLines = result.invalidLines;
  } else if (dataFormat === 'binary') {
    points = parsePCD_Binary(arrayBuffer, headerByteSize, numPoints, fields, sizes, types, counts);
    // No invalid lines tracking in binary
  } else if (dataFormat === 'binary_compressed') {
    points = parsePCD_BinaryCompressed_LZF(arrayBuffer, headerByteSize, numPoints, fields, sizes, types, counts);
    // No invalid lines tracking in binary_compressed
  } else {
    throw new Error(`Unsupported DATA format: ${header.DATA}`);
  }

  // Calculate bounding box
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
    if (p.z > maxZ) maxZ = p.z;
  }

  return {
    type: 'pcd',
    fileName,
    size,
    pointCount: points.length,
    boundingBox: { minX, minY, minZ, maxX, maxY, maxZ },
    points,
    invalidLines, // Note: invalidLines is only tracked for ascii
  };
}

//parsePCD_ASCII - send progress
function parsePCD_ASCII(arrayBuffer, offset, numPoints) {
  const textDecoder = new TextDecoder();
  const asciiText = textDecoder.decode(arrayBuffer.slice(offset));
  const lines = asciiText.split(/\r?\n/).filter(line => line.trim() !== '');
  const points = [];
  let invalidLines = 0;
  const total = lines.length;

  for (let i = 0; i < lines.length; i++) {
    // Send progress
    if (i % 5000 === 0) {
      const percent = Math.floor((i / total) * 100);
      self.postMessage({ progress: percent });
    }

    const vals = lines[i].trim().split(/\s+/).map(parseFloat);
    if (vals.length >= 3) {
      const x = vals[0], y = vals[1], z = vals[2];
      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        points.push({ x, y, z });
      } else {
        invalidLines++;
      }
    } else {
      invalidLines++;
    }
  }

  // Parsing complete
  self.postMessage({ progress: 100 });

  return {
    points,
    invalidLines,
  };
}

function parsePCD_Binary(arrayBuffer, offset, numPoints, fields, sizes, types, counts) {
  const dataView = new DataView(arrayBuffer, offset);
  
  // Correctly calculate pointStep as sum of size * count for each field
  let pointStep = 0;
  const fieldOffsets = []; // To store offset for each field
  for (let f = 0; f < fields.length; f++) {
    fieldOffsets.push(pointStep);
    pointStep += sizes[f] * counts[f];
  }

  const points = [];
  const totalPoints = numPoints;
  
  for (let i = 0; i < totalPoints; i++) {
    // Send progress
    if (i % 5000 === 0) {
      const percent = Math.floor((i / totalPoints) * 100);
      self.postMessage({ progress: percent });
    }

    const point = {};
    for (let f = 0; f < fields.length; f++) {
      const fieldName = fields[f];
      const type = types[f];
      const size = sizes[f];
      const count = counts[f];
      const byteOffset = i * pointStep + fieldOffsets[f];

      // Only process x, y, z
      if (fieldName === 'x' || fieldName === 'y' || fieldName === 'z') {
        if (type === 'F' && size === 4 && count === 1) {
          point[fieldName] = dataView.getFloat32(byteOffset, true);
        } else if (type === 'I' && size === 4 && count === 1) {
          point[fieldName] = dataView.getInt32(byteOffset, true);
        } else if (type === 'U' && size === 4 && count === 1) {
          point[fieldName] = dataView.getUint32(byteOffset, true);
        } else {
          point[fieldName] = null; // 或其他默认值
        }
      }
      // Skip other fields (e.g., '_')
    }
    points.push(point);
  }

  self.postMessage({ progress: 100 });
  return points;
}

function parsePCD_BinaryCompressed_LZF(arrayBuffer, offset, numPoints, fields, sizes, types, counts) {
  const view = new DataView(arrayBuffer, offset);
  if (view.byteLength < 8) {
    throw new Error('Not enough data to read compressedSize/uncompressedSize.');
  }

  const compressedSize = view.getUint32(0, true);
  const uncompressedSize = view.getUint32(4, true);

  if (view.byteLength < 8 + compressedSize) {
    throw new Error('Buffer is too short for the indicated compressedSize');
  }

  const compressedData = new Uint8Array(arrayBuffer, offset + 8, compressedSize);

  let decompressed;
  try {
    decompressed = lzf.decompress(compressedData, uncompressedSize);
  } catch (err) {
    throw new Error('LZFJS decompress error: ' + err.message);
  }

  if (decompressed.length !== uncompressedSize) {
    console.warn(`LZF: mismatch uncompressedSize => got=${decompressed.length}, expected=${uncompressedSize}`);
  }

  // SoA to AoS
  const { points } = reorderSoAToAoS_withProgress(decompressed, numPoints, fields, sizes, types);
  self.postMessage({ progress: 100 });
  return points;
}

// =========== reorderSoAToAoS_withProgress ===========
function reorderSoAToAoS_withProgress(decompressed, numPoints, fields, sizes, types) {
  const totalFields = fields.length;
  const pointStep = sizes.reduce((sum, s) => sum + s, 0); // Assuming SoA

  const dataView = new DataView(decompressed.buffer, decompressed.byteOffset, decompressed.byteLength);

  const fieldOffsets = [];
  {
    let offset = 0;
    for (let f = 0; f < totalFields; f++) {
      fieldOffsets.push(offset);
      offset += sizes[f] * numPoints; // SoA
    }
  }

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    // Progress
    if (i % 5000 === 0) {
      const p = Math.floor((i / numPoints) * 100);
      self.postMessage({ progress: p });
    }

    const point = {};
    for (let f = 0; f < totalFields; f++) {
      const fName = fields[f];
      const fType = types[f];
      const fSize = sizes[f];
      const byteOffset = fieldOffsets[f] + i * fSize;

      // Only process x, y, z
      if (fName === 'x' || fName === 'y' || fName === 'z') {
        if (fType === 'F' && fSize === 4) {
          point[fName] = dataView.getFloat32(byteOffset, true);
        } else if (fType === 'I' && fSize === 4) {
          point[fName] = dataView.getInt32(byteOffset, true);
        } else if (fType === 'U' && fSize === 4) {
          point[fName] = dataView.getUint32(byteOffset, true);
        } else {
          point[fName] = null;
        }
      }
      // Skip other fields
    }
    points.push(point);
  }

  const validPoints = points.filter(p => 
    isFinite(p.x) && isFinite(p.y) && isFinite(p.z)
  );
  return { points: validPoints };
}
