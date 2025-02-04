// src/fileParser.js

export const parseFile = (
    fileType,
    textOrBuffer,
    fileName,
    onProgress,
    voxelSize,
    fileSizeBytes
  ) => {
    return new Promise((resolve, reject) => {
      // create worker
      const worker = new Worker(new URL('./worker/fileParser.worker.js', import.meta.url));
  
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
      const payload = {
        fileType,
        fileName,
        voxelSize,
        size: fileSizeBytes,
      };
  
      if (textOrBuffer instanceof ArrayBuffer) {
        payload.arrayBuffer = textOrBuffer;
        // Transfer ownership of the arrayBuffer
        worker.postMessage(payload, [textOrBuffer]);
      } else {
        payload.text = textOrBuffer;
        worker.postMessage(payload);
      }
  
      const cleanup = () => {
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        worker.terminate();
      };
    });
  };