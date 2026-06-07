/* Frame capture + JPEG encode off the main thread (OffscreenCanvas). */

let offscreen = null;
let ctx = null;
let offscreenSupported = typeof OffscreenCanvas !== 'undefined';

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'init') {
    if (!offscreenSupported) {
      self.postMessage({ type: 'unsupported' });
      return;
    }

    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'capture') {
    if (!offscreenSupported) {
      self.postMessage({ type: 'error', message: 'OffscreenCanvas unavailable' });
      return;
    }

    const {
      bitmap,
      width,
      height,
      output = 'blob',
      quality = 0.85,
      format = 'image/jpeg',
    } = event.data;

    try {
      if (!offscreen) {
        offscreen = new OffscreenCanvas(width, height);
        ctx = offscreen.getContext('2d', { alpha: false });
      }

      if (offscreen.width !== width || offscreen.height !== height) {
        offscreen.width = width;
        offscreen.height = height;
      }

      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      if (output === 'bitmap') {
        const frameBitmap = offscreen.transferToImageBitmap();
        self.postMessage(
          { type: 'frame-bitmap', bitmap: frameBitmap, width, height },
          [frameBitmap],
        );
        return;
      }

      const blob = await offscreen.convertToBlob({ type: format, quality });
      const buffer = await blob.arrayBuffer();
      self.postMessage(
        { type: 'frame-blob', buffer, width, height },
        [buffer],
      );
    } catch (error) {
      try {
        bitmap?.close();
      } catch {
        /* ignore */
      }
      self.postMessage({ type: 'error', message: error.message });
    }
  }
};
