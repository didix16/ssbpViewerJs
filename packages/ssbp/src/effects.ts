import { argb, SsbpError } from './binary.js';
import { multiply, rotation, scaling, translation } from './math.js';
import type { DrawCommand, Effect, EffectNode, Project } from './model.js';
import type { DrawState } from './evaluate.js';
import { makeCommand } from './evaluate.js';

const seedTable = [
  485, 583, 814, 907, 1311, 1901, 2236, 3051, 3676, 4338, 4671, 4775, 4928, 4960, 5228, 5591, 5755,
  5825, 5885, 5967, 6014, 6056, 6399, 6938, 7553, 8280, 8510, 8641, 8893, 9043, 31043, 31043,
];
/** MT19937, the generator used by the original SpriteStudio runtime. */
class Random {
  private state = new Uint32Array(624);
  private index = 624;
  constructor(seed: number) {
    this.state[0] = seed >>> 0;
    for (let i = 1; i < 624; i++)
      this.state[i] =
        (Math.imul(1812433253, this.state[i - 1] ^ (this.state[i - 1] >>> 30)) + i) >>> 0;
  }
  next(): number {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i++) {
        const y = (this.state[i] & 0x80000000) | (this.state[(i + 1) % 624] & 0x7fffffff);
        this.state[i] = this.state[(i + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
      }
      this.index = 0;
    }
    let y = this.state[this.index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return (y >>> 9) / 8388608;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
}
interface Particle {
  emitter: Emitter;
  node: EffectNode;
  age: number;
  life: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  speed: number;
  endSpeed: number;
  angle: number;
  spin: number;
  tangent: number;
  color: number[];
  endColor: number[];
  size: number[];
  endSize: number[];
}
interface Emitter {
  node: EffectNode;
  random: Random;
  age: number;
  next: number;
  x: number;
  y: number;
  parent?: Particle;
  depth: number;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const values = (n: EffectNode, type: number) => n.behaviors.find((b) => b.type === type)?.values;

/** Deterministic half-frame particle simulation, including child emitters. */
export function evaluateEffect(
  project: Project,
  effect: Effect,
  frame: number,
  base: number[],
  alpha: number,
  path: string,
  seed: number,
): DrawCommand[] {
  if (frame < 0 || !Number.isFinite(frame)) return [];
  if (frame > 18000)
    throw new SsbpError('El efecto supera el límite de simulación de 18000 fotogramas');
  const emitters: Emitter[] = [],
    particles: Particle[] = [];
  const createEmitter = (node: EffectNode, parent?: Particle, depth = 0) => {
    if (depth > 8 || emitters.length > 4096)
      throw new SsbpError('El efecto supera el límite de emisores');
    const chosen = values(node, 2)?.[0] ?? (effect.lockSeed ? effect.seed : seed);
    const rng = new Random(chosen >= 0 && chosen < 32 ? seedTable[chosen] : chosen);
    for (let i = 0; i < emitters.length % 9; i++) rng.next();
    emitters.push({
      node,
      random: rng,
      age: 0,
      next: values(node, 3)?.[0] ?? 0,
      x: parent?.x ?? 0,
      y: parent?.y ?? 0,
      parent,
      depth,
    });
  };
  for (const node of effect.nodes)
    if (node.type === 1 && (node.parentIndex < 0 || effect.nodes[node.parentIndex]?.type === 0))
      createEmitter(node);
  const spawn = (e: Emitter, node: EffectNode): Particle => {
    const basic = values(e.node, 1) ?? [0, 32, 1, 1, 30, 1, 1, 30, 30, 0, 0],
      rng = e.random;
    const life = Math.max(0.5, rng.range(basic[7], basic[8])),
      direction = ((basic[9] + rng.range(-basic[10] / 2, basic[10] / 2) + 90) * Math.PI) / 180;
    const speed = rng.range(basic[5], basic[6]);
    const p: Particle = {
      emitter: e,
      node,
      age: 0,
      life,
      x: e.x,
      y: e.y,
      baseX: e.x,
      baseY: e.y,
      vx: Math.cos(direction),
      vy: Math.sin(direction),
      speed,
      endSpeed: speed,
      angle: 0,
      spin: 0,
      tangent: 0,
      color: [1, 1, 1, 1],
      endColor: [1, 1, 1, 1],
      size: [1, 1],
      endSize: [1, 1],
    };
    const behaviors = [...e.node.behaviors, ...node.behaviors];
    for (const b of behaviors) {
      const v = b.values;
      if (b.type === 5) {
        p.x += rng.range(v[0], v[1]);
        p.y += rng.range(v[2], v[3]);
      }
      if (b.type === 6) {
        p.angle = rng.range(v[0], v[1]);
        p.spin = rng.range(v[2], v[3]);
      }
      if (b.type === 8) p.endSpeed = rng.range(v[0], v[1]);
      if (b.type === 9) p.tangent = rng.range(v[0], v[1]);
      if (b.type === 10 || b.type === 11) {
        const a = argb(v[0]),
          z = argb(v[1]);
        const color = a.map((n, i) => rng.range(n, z[i]));
        if (b.type === 10) p.color = color;
        else p.endColor = color;
      }
      if (b.type === 13 || b.type === 14) {
        const factor = rng.range(v[4], v[5]),
          size = [rng.range(v[0], v[1]) * factor, rng.range(v[2], v[3]) * factor];
        if (b.type === 13) p.size = size;
        else p.endSize = size;
      }
    }
    if (!behaviors.some((b) => b.type === 11)) p.endColor = [...p.color];
    if (!behaviors.some((b) => b.type === 14)) p.endSize = [...p.size];
    particles.push(p);
    for (const child of effect.nodes)
      if (child.parentIndex === node.index && child.type === 1)
        createEmitter(child, p, e.depth + 1);
    return p;
  };
  for (let t = 0; t <= frame; t += 0.5) {
    for (const e of [...emitters]) {
      if (e.parent) {
        e.x = e.parent.x;
        e.y = e.parent.y;
        if (e.parent.age >= e.parent.life) continue;
      }
      const basic = values(e.node, 1);
      if (!basic) continue;
      const delay = values(e.node, 3)?.[0] ?? 0,
        duration = basic[4];
      if (e.age >= e.next && (!duration || e.age <= duration + delay)) {
        const count = particles.filter((p) => p.emitter === e && p.age < p.life).length;
        const child = effect.nodes.find((n) => n.parentIndex === e.node.index && n.type === 2);
        if (child)
          for (let b = 0; b < basic[2] && count + b < basic[1]; b++) {
            if (particles.length >= 100000)
              throw new SsbpError('El efecto supera el límite de partículas');
            spawn(e, child);
          }
        e.next += Math.max(0.5, basic[3]);
      }
      e.age += 0.5;
    }
    if (t + 0.5 > frame) break;
    for (const p of particles) {
      if (p.age >= p.life) continue;
      const behaviors = [...p.emitter.node.behaviors, ...p.node.behaviors],
        progress = p.age / p.life;
      const get = (type: number) => behaviors.find((b) => b.type === type)?.values;
      const transRotation = get(7),
        gravity = get(4) ?? [0, 0],
        point = get(15);
      p.angle +=
        p.spin *
        (transRotation
          ? lerp(1, transRotation[0], clamp(progress / Math.max(0.0001, transRotation[1] / 100)))
          : 1) *
        0.5;
      p.age += 0.5;
      const speed = lerp(p.speed, p.endSpeed, p.age / p.life),
        length = Math.hypot(p.x, p.y) || 1;
      let gx = gravity[0] * p.age,
        gy = gravity[1] * p.age;
      if (point) {
        const dx = point[0] + p.emitter.x - p.x,
          dy = point[1] + p.emitter.y - p.y,
          d = Math.hypot(dx, dy) || 1;
        gx += (dx / d) * point[2];
        gy += (dy / d) * point[2];
      }
      const tangentX = -(p.y / length) * p.tangent,
        tangentY = (p.x / length) * p.tangent;
      p.x += (p.vx * speed + tangentX + gx) * 0.5;
      p.y += (p.vy * speed + tangentY + gy) * 0.5;
    }
  }
  return particles
    .filter((p) => p.age < p.life)
    .sort((a, b) => (values(a.emitter.node, 1)?.[0] ?? 0) - (values(b.emitter.node, 1)?.[0] ?? 0))
    .flatMap((p, i) => {
      const cellIndex = p.emitter.node.cellIndex >= 0 ? p.emitter.node.cellIndex : p.node.cellIndex,
        cell = project.cells[cellIndex];
      if (!cell) return [];
      const progress = p.age / p.life,
        behaviors = [...p.emitter.node.behaviors, ...p.node.behaviors],
        fade = behaviors.find((b) => b.type === 12)?.values;
      const color = p.color.map((v, n) => lerp(v, p.endColor[n], progress));
      if (fade)
        color[3] *=
          (fade[0] ? clamp((progress * 100) / fade[0]) : 1) *
          (fade[1] < 100 ? clamp((100 - progress * 100) / (100 - fade[1])) : 1);
      const angle =
        p.angle +
        (behaviors.some((b) => b.type === 16) ? (Math.atan2(p.vy, p.vx) * 180) / Math.PI - 90 : 0);
      const matrix = multiply(
        base,
        multiply(
          translation(p.x, p.y),
          multiply(
            rotation('z', angle),
            scaling(
              lerp(p.size[0], p.endSize[0], progress),
              lerp(p.size[1], p.endSize[1], progress),
            ),
          ),
        ),
      );
      const state: DrawState = {
        part: { index: i, name: effect.name, blendMode: p.emitter.node.blendMode === 1 ? 2 : 0 },
        flags: 0,
        sizeX: cell.width,
        sizeY: cell.height,
        vertexOffsets: [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        colors: Array.from({ length: 4 }, () => [color[0], color[1], color[2], color[3]]),
        colorBlend: 4,
        u: 0,
        v: 0,
        uvRotation: 0,
        uScale: 1,
        vScale: 1,
      };
      return [makeCommand(cell, cellIndex, state, matrix, `${path}/particle-${i}`, alpha)];
    });
}
