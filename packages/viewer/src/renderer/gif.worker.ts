/// <reference lib="webworker" />
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import type { GifRequest, GifResponse } from './gif-protocol';

const worker = self as unknown as DedicatedWorkerGlobalScope;
const encoder = GIFEncoder();
const reply = (message: GifResponse, transfer: Transferable[] = []) =>
  worker.postMessage(message, transfer);

worker.onmessage = (event: MessageEvent<GifRequest>) => {
  try {
    const message = event.data;
    if (message.type === 'finish') {
      encoder.finish();
      const bytes = encoder.bytes();
      reply({ type: 'done', bytes: bytes.buffer }, [bytes.buffer]);
      return;
    }
    const { width, height, delay, repeat } = message,
      pixels = new Uint8Array(message.pixels);
    // WebGL rows run bottom to top. Reverse in place, without a second image allocation.
    const stride = width * 4,
      row = new Uint8Array(stride);
    for (let y = 0; y < Math.floor(height / 2); y++) {
      const a = y * stride,
        b = (height - y - 1) * stride;
      row.set(pixels.subarray(a, a + stride));
      pixels.copyWithin(a, b, b + stride);
      pixels.set(row, b);
    }
    // GIF has binary alpha. Reserve palette index zero exclusively for transparency.
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha < 128) pixels.fill(0, i, i + 4);
      else {
        for (let c = 0; c < 3; c++)
          pixels[i + c] = Math.min(255, Math.round((pixels[i + c] * 255) / alpha));
        pixels[i + 3] = 255;
      }
    }
    const colors = quantize(pixels, 255, { format: 'rgb565' });
    const index = applyPalette(pixels, colors, 'rgb565');
    for (let i = 0; i < index.length; i++) index[i] = pixels[i * 4 + 3] ? index[i] + 1 : 0;
    encoder.writeFrame(index, width, height, {
      palette: [[0, 0, 0], ...colors],
      delay,
      repeat,
      transparent: true,
      transparentIndex: 0,
      dispose: 2,
    });
    reply({ type: 'frame' });
  } catch (error) {
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
