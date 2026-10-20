declare module 'gifenc' {
  export interface GifEncoder {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options: {
        palette: number[][];
        delay: number;
        repeat?: number;
        transparent?: boolean;
        transparentIndex?: number;
        dispose?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
  }
  export function GIFEncoder(): GifEncoder;
  export function quantize(
    data: Uint8Array,
    colors: number,
    options?: { format?: 'rgb565' },
  ): number[][];
  export function applyPalette(
    data: Uint8Array,
    palette: number[][],
    format?: 'rgb565',
  ): Uint8Array;
}
