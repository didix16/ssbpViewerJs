export class SsbpError extends Error {
  constructor(
    message: string,
    public readonly offset?: number,
  ) {
    super(offset === undefined ? message : `${message} (offset 0x${offset.toString(16)})`);
    this.name = 'SsbpError';
  }
}

/** Binary offsets are relative to the supplied view, including for sliced Uint8Arrays. */
export class BinaryReader {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly strings = new Map<number, string>();
  constructor(input: ArrayBuffer | Uint8Array) {
    this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
  }
  span(offset: number, length: number): void {
    if (
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(length) ||
      offset < 0 ||
      length < 0 ||
      offset > this.bytes.length - length
    )
      throw new SsbpError(`Datos fuera del archivo: se necesitan ${length} bytes`, offset);
  }
  table(offset: number, count: number, size: number): void {
    if (count < 0 || !Number.isInteger(count))
      throw new SsbpError('Cantidad de elementos inválida', offset);
    if (count && offset < 36) throw new SsbpError('Referencia a tabla inválida', offset);
    this.span(offset, count * size);
  }
  u16(o: number): number {
    this.span(o, 2);
    return this.view.getUint16(o, true);
  }
  i16(o: number): number {
    this.span(o, 2);
    return this.view.getInt16(o, true);
  }
  u32(o: number): number {
    this.span(o, 4);
    return this.view.getUint32(o, true);
  }
  i32(o: number): number {
    this.span(o, 4);
    return this.view.getInt32(o, true);
  }
  f32(o: number): number {
    this.span(o, 4);
    const n = this.view.getFloat32(o, true);
    if (!Number.isFinite(n)) throw new SsbpError('Valor flotante inválido', o);
    return n;
  }
  string(o: number): string {
    if (o === 0) return '';
    const cached = this.strings.get(o);
    if (cached !== undefined) return cached;
    this.span(o, 1);
    let end = o;
    while (end < this.bytes.length && this.bytes[end] !== 0 && end - o < 1048576) end++;
    if (this.bytes[end] !== 0) throw new SsbpError('Cadena sin terminador', o);
    let escaped = '';
    for (let i = o; i < end; i++) escaped += `%${this.bytes[i].toString(16).padStart(2, '0')}`;
    let value: string;
    try {
      value = decodeURIComponent(escaped);
    } catch {
      throw new SsbpError('Cadena UTF-8 inválida', o);
    }
    this.strings.set(o, value);
    return value;
  }
  cursor(offset: number): Cursor {
    this.span(offset, 0);
    return new Cursor(this, offset);
  }
}
export class Cursor {
  constructor(
    readonly reader: BinaryReader,
    public offset: number,
  ) {}
  u16(): number {
    const v = this.reader.u16(this.offset);
    this.offset += 2;
    return v;
  }
  i16(): number {
    const v = this.reader.i16(this.offset);
    this.offset += 2;
    return v;
  }
  u32(): number {
    const v = this.reader.u32(this.offset);
    this.offset += 4;
    return v;
  }
  i32(): number {
    const v = this.reader.i32(this.offset);
    this.offset += 4;
    return v;
  }
  f32(): number {
    const v = this.reader.f32(this.offset);
    this.offset += 4;
    return v;
  }
}
export function argb(raw: number): [number, number, number, number] {
  return [
    ((raw >>> 16) & 255) / 255,
    ((raw >>> 8) & 255) / 255,
    (raw & 255) / 255,
    (raw >>> 24) / 255,
  ];
}
