/** PNG encoding directly from WebGL pixels: no Canvas 2D or extra dependency. */
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(data.length + 12),
    view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < data.length + 8; i++) crc = crcTable[(crc ^ out[i]) & 255] ^ (crc >>> 8);
  view.setUint32(data.length + 8, (crc ^ 0xffffffff) >>> 0);
  return out;
}
export async function encodePng(width: number, height: number, rgba: Uint8Array): Promise<Blob> {
  const scanlines = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    for (let x = 0; x < width; x++) {
      const input = ((height - y - 1) * width + x) * 4,
        output = row + 1 + x * 4,
        a = rgba[input + 3];
      // The WebGL drawing buffer is premultiplied; PNG uses straight RGBA.
      scanlines[output] = a ? Math.min(255, Math.round((rgba[input] * 255) / a)) : 0;
      scanlines[output + 1] = a ? Math.min(255, Math.round((rgba[input + 1] * 255) / a)) : 0;
      scanlines[output + 2] = a ? Math.min(255, Math.round((rgba[input + 2] * 255) / a)) : 0;
      scanlines[output + 3] = a;
    }
  }
  const header = new Uint8Array(13),
    view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const stream = new Blob([scanlines]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return new Blob(
    [
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', compressed),
      chunk('IEND', new Uint8Array()),
    ],
    { type: 'image/png' },
  );
}
