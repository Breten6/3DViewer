// src/fileParser.js

export const parseFile = (fileType, textOrBuffer, fileName, onProgress, voxelSize) => {
    return new Promise((resolve, reject) => {
      // create worker
      const worker = new Worker(new URL('./fileParser.worker.js', import.meta.url));
  
      // handle worker return
      const handleMessage = (e) => {
        const { success, data, error, progress } = e.data;
  
        // on pregress
        if (progress !== undefined && onProgress) {
          onProgress(progress);
        }
  
        // if done
        if ('success' in e.data) {
          if (success) {
            resolve(data);
          } else {
            reject(error);
          }
          cleanup();
        }
      };
  
      // handle failure
      const handleError = (err) => {
        reject(err.message);
        cleanup();
      };
  
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
  
      // prepare massage send to worker
      let sizeKB = 0;
      const payload = { fileType, fileName, voxelSize };
  
      // handle binary pcd
      if (textOrBuffer instanceof ArrayBuffer) {
        sizeKB = (textOrBuffer.byteLength / 1024).toFixed(2);
        payload.arrayBuffer = textOrBuffer;
        payload.size = sizeKB;
  
        worker.postMessage(payload, [textOrBuffer]);
      } else {
        // handle xyz geojson
        sizeKB = (textOrBuffer.length / 1024).toFixed(2);
        payload.text = textOrBuffer;
        payload.size = sizeKB;
  
        worker.postMessage(payload);
      }
  
      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        worker.terminate();
      };
    });
  };
  