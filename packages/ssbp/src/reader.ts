import { BinaryReader, SsbpError, argb } from './binary.js';
import { PartFlags as F, PartType } from './model.js';
import type {
  Animation,
  AnimePack,
  CellMap,
  DecodedFrame,
  DecodedPart,
  EffectBehavior,
  InitialState,
  Project,
  UserData,
} from './model.js';

const initialFloatNames = [
  'pivotX',
  'pivotY',
  'rotationX',
  'rotationY',
  'rotationZ',
  'scaleX',
  'scaleY',
  'sizeX',
  'sizeY',
  'u',
  'v',
  'uvRotation',
  'uScale',
  'vScale',
  'radius',
] as const;
const effectLayouts: Record<number, string> = {
  0: '',
  1: 'iiiiiffiiff',
  2: 'i',
  3: 'i',
  4: 'ff',
  5: 'ffff',
  6: 'ffff',
  7: 'ff',
  8: 'ff',
  9: 'ff',
  10: 'uu',
  11: 'uu',
  12: 'ff',
  13: 'ffffff',
  14: 'ffffff',
  15: 'fff',
  16: 'i',
};

/** Validated little-endian SSBP v3 reader. Does not allocate or decode textures. */
export class SsbpFile {
  readonly project: Project;
  private readonly reader: BinaryReader;
  private readonly frameCache = new Map<Animation, Map<number, DecodedFrame>>();
  constructor(input: ArrayBuffer | Uint8Array) {
    const r = (this.reader = new BinaryReader(input));
    r.span(0, 36);
    if (r.u32(0) !== 0x42505353) throw new SsbpError('Missing SSBP signature', 0);
    const version = r.u32(4);
    if (version !== 3)
      throw new SsbpError(
        `SSBP version ${version} is not supported; only version 3 is supported`,
        4,
      );
    const cellOffset = r.u32(16),
      packOffset = r.u32(20),
      effectOffset = r.u32(24);
    const cellCount = r.i16(28),
      packCount = r.i16(30),
      effectCount = r.i16(32);
    r.table(cellOffset, cellCount, 28);
    r.table(packOffset, packCount, 16);
    r.table(effectOffset, effectCount, 16);
    const maps = new Map<number, CellMap>();
    const cells = Array.from({ length: cellCount }, (_, i) => {
      const o = cellOffset + i * 28,
        mapOffset = r.u32(o + 4);
      let cellMap = maps.get(mapOffset);
      if (!cellMap) {
        r.table(mapOffset, 1, 16);
        cellMap = {
          name: r.string(r.u32(mapOffset)),
          imagePath: r.string(r.u32(mapOffset + 4)),
          index: r.i16(mapOffset + 8),
          wrapMode: r.i16(mapOffset + 10),
          filterMode: r.i16(mapOffset + 12),
        };
        maps.set(mapOffset, cellMap);
      }
      return {
        name: r.string(r.u32(o)),
        cellMap,
        index: r.i16(o + 8),
        x: r.i16(o + 10),
        y: r.i16(o + 12),
        width: r.u16(o + 14),
        height: r.u16(o + 16),
        pivotX: r.f32(o + 20),
        pivotY: r.f32(o + 24),
      };
    });
    const packs: AnimePack[] = Array.from({ length: packCount }, (_, i) => {
      const o = packOffset + i * 16,
        partsOffset = r.u32(o + 4),
        animationsOffset = r.u32(o + 8);
      const partCount = r.i16(o + 12),
        animationCount = r.i16(o + 14);
      r.table(partsOffset, partCount, 28);
      r.table(animationsOffset, animationCount, 32);
      const parts = Array.from({ length: partCount }, (_, j) => {
        const p = partsOffset + j * 28;
        const part = {
          name: r.string(r.u32(p)),
          index: r.i16(p + 4),
          parentIndex: r.i16(p + 6),
          type: r.i16(p + 8),
          boundsType: r.i16(p + 10),
          blendMode: r.i16(p + 12),
          reference: r.string(r.u32(p + 16)),
          effect: r.string(r.u32(p + 20)),
          colorLabel: r.string(r.u32(p + 24)),
        };
        if (
          part.index !== j ||
          part.parentIndex >= partCount ||
          part.parentIndex < -1 ||
          part.parentIndex === j
        )
          throw new SsbpError('Invalid part hierarchy', p);
        return part;
      });
      // Check cycles even if the file does not store parents before children.
      for (const part of parts) {
        const seen = new Set<number>();
        let current = part;
        while (current.parentIndex >= 0) {
          if (seen.has(current.index))
            throw new SsbpError('Cycle in the part hierarchy', partsOffset);
          seen.add(current.index);
          current = parts[current.parentIndex];
        }
      }
      const animations = Array.from({ length: animationCount }, (_, j): Animation => {
        const a = animationsOffset + j * 32,
          initOffset = r.u32(a + 4),
          frameOffset = r.u32(a + 8),
          userOffset = r.u32(a + 12),
          labelOffset = r.u32(a + 16);
        const frameCount = r.i16(a + 20),
          fps = r.i16(a + 22),
          labelCount = r.i16(a + 24);
        if (frameCount <= 0 || fps <= 0) throw new SsbpError('Invalid duration or FPS', a);
        r.table(initOffset, partCount, 80);
        r.table(frameOffset, frameCount, 4);
        if (userOffset) r.table(userOffset, frameCount, 4);
        r.table(labelOffset, labelCount, 4);
        const initial = Array.from({ length: partCount }, (_, k) => {
          const d = initOffset + k * 80;
          const state = {
            index: r.i16(d),
            flags: r.u32(d + 4),
            cellIndex: r.i16(d + 8),
            x: r.i16(d + 10) / 10,
            y: r.i16(d + 12) / 10,
            z: r.i16(d + 14) / 10,
            opacity: r.u16(d + 16),
          } as InitialState;
          initialFloatNames.forEach((name, n) => {
            state[name] = r.f32(d + 20 + n * 4);
          });
          if (state.index !== k || state.cellIndex < -1 || state.cellIndex >= cellCount)
            throw new SsbpError('Invalid initial state', d);
          return state;
        });
        const frameOffsets = Array.from({ length: frameCount }, (_, k) => {
          const f = r.u32(frameOffset + k * 4);
          r.table(f, partCount, 6);
          return f;
        });
        return {
          name: r.string(r.u32(a)),
          frameCount,
          fps,
          width: r.i16(a + 26),
          height: r.i16(a + 28),
          initial,
          frameOffsets,
          userDataOffsets: userOffset
            ? Array.from({ length: frameCount }, (_, k) => r.u32(userOffset + k * 4))
            : [],
          labels: Array.from({ length: labelCount }, (_, k) => {
            const l = r.u32(labelOffset + k * 4);
            r.span(l, 6);
            return { name: r.string(r.u32(l)), frame: r.u16(l + 4) };
          }),
        };
      });
      return { name: r.string(r.u32(o)), parts, animations };
    });
    const effects = Array.from({ length: effectCount }, (_, i) => {
      const e = effectOffset + i * 16,
        nodeCount = r.i16(e + 10),
        nodesOffset = r.u32(e + 12);
      r.table(nodesOffset, nodeCount, 16);
      const nodes = Array.from({ length: nodeCount }, (_, j) => {
        const n = nodesOffset + j * 16,
          count = r.i16(n + 10),
          listOffset = r.u32(n + 12);
        r.table(listOffset, count, 4);
        const behaviors = Array.from({ length: count }, (_, k): EffectBehavior => {
          const cursor = r.cursor(r.u32(listOffset + k * 4)),
            type = cursor.i32(),
            layout = effectLayouts[type];
          if (layout === undefined)
            throw new SsbpError(`Unknown effect command: ${type}`, cursor.offset - 4);
          return {
            type,
            values: [...layout].map((t) =>
              t === 'f' ? cursor.f32() : t === 'u' ? cursor.u32() : cursor.i32(),
            ),
          };
        });
        return {
          index: r.i16(n),
          parentIndex: r.i16(n + 2),
          type: r.i16(n + 4),
          cellIndex: r.i16(n + 6),
          blendMode: r.i16(n + 8),
          behaviors,
        };
      });
      return {
        name: r.string(r.u32(e)),
        fps: r.i16(e + 4),
        lockSeed: r.i16(e + 6) !== 0,
        seed: r.i16(e + 8),
        nodes,
      };
    });
    this.project = {
      version,
      flags: r.u32(8),
      imageBaseDir: r.string(r.u32(12)),
      byteLength: r.bytes.length,
      cells,
      cellMaps: [...maps.values()],
      packs,
      effects,
    };
  }
  getAnimation(packName: string, animationName: string): { pack: AnimePack; animation: Animation } {
    const pack = this.project.packs.find((p) => p.name === packName);
    const animation = pack?.animations.find((a) => a.name === animationName);
    if (!pack || !animation)
      throw new SsbpError(`Animation not found: ${packName}/${animationName}`);
    return { pack, animation };
  }
  decodeFrame(packName: string, animationName: string, frame: number): DecodedFrame {
    const { pack, animation } = this.getAnimation(packName, animationName);
    if (!Number.isInteger(frame) || frame < 0 || frame >= animation.frameCount)
      throw new SsbpError(`Frame out of range: ${frame}`);
    let cache = this.frameCache.get(animation);
    if (!cache) {
      cache = new Map();
      this.frameCache.set(animation, cache);
    }
    const hit = cache.get(frame);
    if (hit) return hit;
    const c = this.reader.cursor(animation.frameOffsets[frame]),
      parts: DecodedPart[] = [],
      seen = new Set<number>();
    for (let i = 0; i < pack.parts.length; i++) {
      const index = c.i16(),
        part = pack.parts[index],
        initial = animation.initial[index];
      if (!part || seen.has(index))
        throw new SsbpError('Invalid or duplicate part index', c.offset - 2);
      seen.add(index);
      const flags = c.u32();
      if (flags & 0x80000000) throw new SsbpError('Unknown frame flags', c.offset - 4);
      const state: DecodedPart = {
        ...initial,
        part,
        flags,
        visible: !(flags & F.Invisible),
        flipX: !!(flags & F.FlipX),
        flipY: !!(flags & F.FlipY),
        vertexOffsets: [
          [0, 0],
          [0, 0],
          [0, 0],
          [0, 0],
        ],
        colors: [
          [1, 1, 1, 0],
          [1, 1, 1, 0],
          [1, 1, 1, 0],
          [1, 1, 1, 0],
        ],
        colorBlend: -1,
        instance: { keyframe: 0, start: 0, end: 0, speed: 0, loops: 0, flags: 0 },
      };
      if (flags & F.Cell) state.cellIndex = c.i16();
      if (state.cellIndex < -1 || state.cellIndex >= this.project.cells.length)
        throw new SsbpError('Invalid cell reference', c.offset);
      if (flags & F.X) state.x = c.i16() / 10;
      if (flags & F.Y) state.y = c.i16() / 10;
      if (flags & F.Z) state.z = c.i16() / 10;
      for (const [bit, name] of [
        [F.PivotX, 'pivotX'],
        [F.PivotY, 'pivotY'],
        [F.RotationX, 'rotationX'],
        [F.RotationY, 'rotationY'],
        [F.RotationZ, 'rotationZ'],
        [F.ScaleX, 'scaleX'],
        [F.ScaleY, 'scaleY'],
      ] as const)
        if (flags & bit) state[name] = c.f32();
      if (flags & F.Opacity) state.opacity = c.u16();
      for (const [bit, name] of [
        [F.SizeX, 'sizeX'],
        [F.SizeY, 'sizeY'],
        [F.U, 'u'],
        [F.V, 'v'],
        [F.UVRotation, 'uvRotation'],
        [F.UScale, 'uScale'],
        [F.VScale, 'vScale'],
        [F.Radius, 'radius'],
      ] as const)
        if (flags & bit) state[name] = c.f32();
      if (flags & F.Vertices) {
        const mask = c.u16();
        for (let v = 0; v < 4; v++)
          if (mask & (1 << v)) state.vertexOffsets[v] = [c.i16(), c.i16()];
      }
      if (flags & F.Color) {
        const typeAndFlags = c.u16(),
          mask = typeAndFlags >>> 8;
        state.colorBlend = typeAndFlags & 255;
        const read = () => {
          c.f32();
          return argb(c.u32());
        }; // The v3 player encodes the blend weight in color alpha.
        if (mask & 16) {
          const color = read();
          state.colors = Array.from({ length: 4 }, () => [...color]);
        } else for (let v = 0; v < 4; v++) if (mask & (1 << v)) state.colors[v] = read();
      }
      if (part.type === PartType.Instance) {
        if (flags & F.InstanceKey) state.instance.keyframe = c.i16();
        if (flags & F.InstanceStart) state.instance.start = c.i16();
        if (flags & F.InstanceEnd) state.instance.end = c.i16();
        if (flags & F.InstanceSpeed) state.instance.speed = c.f32();
        if (flags & F.InstanceLoops) state.instance.loops = c.i16();
        if (flags & F.InstanceFlags) state.instance.flags = c.i16();
      }
      parts.push(state);
    }
    const userData: UserData[] = [],
      userOffset = animation.userDataOffsets[frame];
    if (userOffset) {
      const u = this.reader.cursor(userOffset),
        count = u.u16();
      this.reader.table(u.offset, count, 4);
      for (let i = 0; i < count; i++) {
        const flags = u.u16(),
          data: UserData = { partIndex: u.u16() };
        if (flags & ~15 || data.partIndex >= pack.parts.length)
          throw new SsbpError('Invalid user data', u.offset - 4);
        if (flags & 1) data.integer = u.i32();
        if (flags & 2) data.rect = [u.i32(), u.i32(), u.i32(), u.i32()];
        if (flags & 4) data.point = [u.i32(), u.i32()];
        if (flags & 8) {
          const size = u.u16(),
            offset = u.u32();
          this.reader.span(offset, size);
          data.text = this.reader.string(offset);
        }
        userData.push(data);
      }
    }
    const result = { frame, parts, userData };
    // Bound memory when inspecting long files and many animations.
    if (cache.size >= 120) cache.delete(cache.keys().next().value!);
    cache.set(frame, result);
    return result;
  }
}

export function readSsbp(input: ArrayBuffer | Uint8Array): SsbpFile {
  return new SsbpFile(input);
}
