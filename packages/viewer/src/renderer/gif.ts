import { evaluateFrame } from '@ssbp/core';
import type { SsbpPlayer } from '@ssbp/core';
import { WebGLRenderer } from './webgl';
import type { TextureAsset } from './webgl';
import { gifDelay } from './gif-protocol';
import type { GifRequest, GifResponse } from './gif-protocol';

export interface ExportGifOptions {
  renderer: WebGLRenderer;
  player: SsbpPlayer;
  textures: TextureAsset[];
  hiddenParts: ReadonlySet<string>;
  signal: AbortSignal;
  onProgress(current: number, total: number): void;
}

/** Render one complete animation into an isolated WebGL canvas; encode off the main thread. */
export async function exportAnimationGif(options: ExportGifOptions): Promise<Blob> {
  const { renderer, player, textures, signal, onProgress } = options;
  const { file, packName, animationName, animation, speed, loop } = player;
  if (!Number.isFinite(speed) || speed === 0)
    throw new Error('Select a nonzero playback speed to export.');
  signal.throwIfAborted();
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:-100000px;top:0;width:${renderer.canvas.clientWidth}px;height:${renderer.canvas.clientHeight}px;visibility:hidden;pointer-events:none`;
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  let snapshot: WebGLRenderer | undefined, worker: Worker | undefined;
  let pending: { resolve(response: GifResponse): void; reject(error: Error): void } | null = null;
  const abort = () => {
    pending?.reject(new DOMException('Export canceled', 'AbortError'));
    pending = null;
    worker?.terminate();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    snapshot = new WebGLRenderer(canvas);
    Object.assign(snapshot.camera, renderer.camera);
    snapshot.fitScale = renderer.fitScale;
    snapshot.wireframe = renderer.wireframe;
    snapshot.setTextures(textures);
    const width = canvas.width,
      height = canvas.height;
    worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<GifResponse>) => {
      const promise = pending;
      pending = null;
      if (event.data.type === 'error') promise?.reject(new Error(event.data.message));
      else promise?.resolve(event.data);
    };
    worker.onerror = (event) => {
      pending?.reject(new Error(event.message || 'Could not encode the GIF.'));
      pending = null;
    };
    const send = (message: GifRequest, transfer: Transferable[] = []): Promise<GifResponse> => {
      signal.throwIfAborted();
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        worker!.postMessage(message, transfer);
      });
    };
    const hiddenParts = new Set(options.hiddenParts);
    for (let i = 0; i < animation.frameCount; i++) {
      signal.throwIfAborted();
      const frame = speed < 0 ? animation.frameCount - 1 - i : i;
      const result = evaluateFrame(file, packName, animationName, frame, {
        hiddenParts,
        time: frame / animation.fps,
      });
      snapshot.render(result.commands);
      const pixels = snapshot.capturePixels();
      if (pixels.width !== width || pixels.height !== height)
        throw new Error('The resolution changed during export. Please try again.');
      await send(
        {
          type: 'frame',
          pixels: pixels.data.buffer,
          width,
          height,
          delay: gifDelay(i, animation.fps, speed),
          repeat: loop ? 0 : -1,
        },
        [pixels.data.buffer],
      );
      onProgress(i + 1, animation.frameCount);
    }
    const response = await send({ type: 'finish' });
    if (response.type !== 'done') throw new Error('GIF encoding did not finish.');
    return new Blob([response.bytes], { type: 'image/gif' });
  } finally {
    signal.removeEventListener('abort', abort);
    worker?.terminate();
    snapshot?.dispose();
    canvas.remove();
  }
}
