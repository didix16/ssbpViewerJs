export type GifRequest =
  | {
      type: 'frame';
      pixels: ArrayBuffer;
      width: number;
      height: number;
      delay: number;
      repeat: number;
    }
  | { type: 'finish' };
export type GifResponse =
  { type: 'frame' } | { type: 'done'; bytes: ArrayBuffer } | { type: 'error'; message: string };

/** GIF stores centiseconds. Distribute rounding error instead of shortening every frame. */
export function gifDelay(frame: number, fps: number, speed: number): number {
  const centiseconds = 100 / (fps * Math.abs(speed));
  return (
    Math.max(1, Math.round((frame + 1) * centiseconds) - Math.round(frame * centiseconds)) * 10
  );
}
