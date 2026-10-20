export function identity(): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
/** Column-major matrices, matching the original OpenGL player. */
export function multiply(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 4; row++)
      for (let k = 0; k < 4; k++) out[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k];
  return out;
}
export function translation(x: number, y: number, z = 0): number[] {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}
export function scaling(x: number, y: number, z = 1): number[] {
  const m = identity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}
export function rotation(axis: 'x' | 'y' | 'z', degrees: number): number[] {
  const m = identity(),
    angle = (degrees * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  if (axis === 'x') {
    m[5] = c;
    m[6] = s;
    m[9] = -s;
    m[10] = c;
  }
  if (axis === 'y') {
    m[0] = c;
    m[2] = -s;
    m[8] = s;
    m[10] = c;
  }
  if (axis === 'z') {
    m[0] = c;
    m[1] = s;
    m[4] = -s;
    m[5] = c;
  }
  return m;
}
export function transform(
  m: readonly number[],
  x: number,
  y: number,
  z = 0,
): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}
