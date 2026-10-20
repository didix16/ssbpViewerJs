import { SsbpError } from './binary.js';
import { identity, multiply, rotation, scaling, transform, translation } from './math.js';
import { PartFlags as F, PartType } from './model.js';
import type {
  Cell,
  DecodedPart,
  DrawCommand,
  EvaluatedFrame,
  EvaluatedPart,
  EvaluateOptions,
  InstanceState,
  Part,
} from './model.js';
import type { SsbpFile } from './reader.js';
import { evaluateEffect } from './effects.js';

export function instanceFrame(
  state: InstanceState,
  frame: number,
  elapsedFrame = frame,
): number | null {
  const time = state.flags & 8 ? elapsedFrame : frame;
  let referenceTime = Math.trunc(time * state.speed) - state.keyframe;
  const span = state.end - state.start + 1;
  if (referenceTime < 0 || span <= 0) return null;
  let loop = Math.floor(referenceTime / span);
  const loops = state.loops * (state.flags & 4 ? 2 : 1);
  if (!(state.flags & 1) && loop >= loops) {
    referenceTime = span - 1;
    loop = Math.max(0, loops - 1);
  }
  const reverse = !!(state.flags & 2) !== (!!(state.flags & 4) && loop % 2 === 1);
  return reverse ? state.end - (referenceTime % span) : state.start + (referenceTime % span);
}

export type DrawState = Pick<
  DecodedPart,
  | 'flags'
  | 'sizeX'
  | 'sizeY'
  | 'vertexOffsets'
  | 'colors'
  | 'colorBlend'
  | 'u'
  | 'v'
  | 'uvRotation'
  | 'uScale'
  | 'vScale'
> & { part: Pick<Part, 'index' | 'name' | 'blendMode'> };

export function makeCommand(
  cell: Cell,
  cellIndex: number,
  state: DrawState,
  matrix: number[],
  path: string,
  opacity: number,
): DrawCommand {
  const width = state.flags & F.SizeX ? state.sizeX : cell.width;
  const height = state.flags & F.SizeY ? state.sizeY : cell.height;
  const corners = [
    [-width / 2, height / 2],
    [width / 2, height / 2],
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
  ];
  const uv = [
    [cell.x, cell.y],
    [cell.x + cell.width, cell.y],
    [cell.x, cell.y + cell.height],
    [cell.x + cell.width, cell.y + cell.height],
  ];
  return {
    partIndex: state.part.index,
    partName: state.part.name,
    path,
    cellIndex,
    cellMap: cell.cellMap,
    opacity,
    blendMode: state.part.blendMode,
    colorBlend: state.colorBlend,
    uvTransform: {
      flags: state.flags,
      u: state.u,
      v: state.v,
      rotation: state.uvRotation,
      scaleU: state.uScale,
      scaleV: state.vScale,
    },
    vertices: corners.map(([x, y], i) => {
      const p = transform(matrix, x + state.vertexOffsets[i][0], y + state.vertexOffsets[i][1]);
      return { x: p[0], y: p[1], z: p[2], u: uv[i][0], v: uv[i][1], color: state.colors[i] };
    }),
  };
}

/** Apply the v3 player's UV operations in their original order. */
export function textureCoordinates(
  command: DrawCommand,
  width: number,
  height: number,
): [number, number][] {
  const t = command.uvTransform,
    uv = command.vertices.map((v) => [v.u / width + t.u, v.v / height + t.v] as [number, number]);
  const centerU = (uv[0][0] + uv[1][0]) / 2,
    centerV = (uv[0][1] + uv[2][1]) / 2;
  const halfU = (uv[1][0] - uv[0][0]) / 2,
    halfV = (uv[2][1] - uv[0][1]) / 2;
  if (t.flags & F.UVRotation) {
    const angle = (t.rotation * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    for (const value of uv) {
      const u = value[0] - centerU,
        v = value[1] - centerV;
      value[0] = centerU + u * c - v * s;
      value[1] = centerV + u * s + v * c;
    }
  }
  for (let i = 0; i < 4; i++) {
    if (t.flags & (F.UScale | F.FlipX))
      uv[i][0] = centerU + (i % 2 ? 1 : -1) * halfU * t.scaleU * (t.flags & F.FlipX ? -1 : 1);
    if (t.flags & (F.VScale | F.FlipY))
      uv[i][1] = centerV + (i >= 2 ? 1 : -1) * halfV * t.scaleV * (t.flags & F.FlipY ? -1 : 1);
  }
  return uv;
}

/** Pure evaluation: deterministic seeking, without a browser or graphics context. */
export function evaluateFrame(
  file: SsbpFile,
  packName: string,
  animationName: string,
  frame: number,
  options: EvaluateOptions = {},
): EvaluatedFrame {
  return evaluate(file, packName, animationName, frame, options, identity(), 1, packName, [], 0);
}

function evaluate(
  file: SsbpFile,
  packName: string,
  animationName: string,
  frame: number,
  options: EvaluateOptions,
  base: number[],
  alpha: number,
  prefix: string,
  stack: string[],
  depth: number,
): EvaluatedFrame {
  const key = `${packName}/${animationName}`;
  if (depth > 16 || stack.includes(key))
    throw new SsbpError(`Referencia de instancia circular o demasiado profunda: ${key}`);
  const { pack, animation } = file.getAnimation(packName, animationName),
    decoded = file.decodeFrame(packName, animationName, frame);
  const byIndex = new Map(decoded.parts.map((s) => [s.part.index, s]));
  const calculated = new Map<
    number,
    { matrix: number[]; visible: boolean; scaleX: number; scaleY: number; rotationZ: number }
  >();
  const build = (
    index: number,
  ): { matrix: number[]; visible: boolean; scaleX: number; scaleY: number; rotationZ: number } => {
    const hit = calculated.get(index);
    if (hit) return hit;
    const s = byIndex.get(index)!;
    const parent =
      s.part.parentIndex >= 0
        ? build(s.part.parentIndex)
        : { matrix: base, visible: true, scaleX: 1, scaleY: 1, rotationZ: 0 };
    let local = translation(s.x, s.y);
    local = multiply(local, rotation('x', s.rotationX));
    local = multiply(local, rotation('y', s.rotationY));
    local = multiply(local, rotation('z', s.rotationZ));
    local = multiply(local, scaling(s.scaleX, s.scaleY));
    const value = {
      matrix: multiply(parent.matrix, local),
      visible: parent.visible && !options.hiddenParts?.has(`${prefix}/${index}`),
      scaleX: parent.scaleX * s.scaleX,
      scaleY: parent.scaleY * s.scaleY,
      rotationZ: parent.rotationZ + s.rotationZ * (parent.scaleX * parent.scaleY < 0 ? -1 : 1),
    };
    calculated.set(index, value);
    return value;
  };
  const commands: DrawCommand[] = [],
    parts: EvaluatedPart[] = [];
  for (const state of decoded.parts) {
    const calculatedState = build(state.part.index),
      matrix = [...calculatedState.matrix],
      cell = file.project.cells[state.cellIndex];
    const path = `${prefix}/${state.part.index}`,
      opacity = Math.max(0, Math.min(1, (state.opacity / 255) * alpha));
    // Pivots shift the image, never the parent matrix inherited by children.
    if (cell) {
      const px = state.pivotX + cell.pivotX * (state.flipX ? -1 : 1),
        py = state.pivotY + cell.pivotY * (state.flipY ? -1 : 1);
      const x = -cell.width * calculatedState.scaleX * px,
        y = cell.height * calculatedState.scaleY * py;
      const angle = (calculatedState.rotationZ * Math.PI) / 180;
      matrix[12] += x * Math.cos(angle) - y * Math.sin(angle);
      matrix[13] += x * Math.sin(angle) + y * Math.cos(angle);
    }
    const visible = calculatedState.visible && state.visible && opacity > 0;
    parts.push({ part: state.part, state, matrix, visible });
    if (!visible) continue;
    if (state.part.type === PartType.Instance && state.part.reference) {
      const slash = state.part.reference.lastIndexOf('/');
      let refPack = slash >= 0 ? state.part.reference.slice(0, slash) : packName;
      const refName = slash >= 0 ? state.part.reference.slice(slash + 1) : state.part.reference;
      if (
        !file.project.packs
          .find((p) => p.name === refPack)
          ?.animations.some((a) => a.name === refName)
      )
        refPack =
          file.project.packs.find((p) => p.animations.some((a) => a.name === refName))?.name ??
          refPack;
      const target = file.getAnimation(refPack, refName);
      const instance = instanceFrame(
        state.instance,
        frame,
        (options.time ?? frame / animation.fps) * animation.fps,
      );
      if (instance !== null) {
        const child = evaluate(
          file,
          refPack,
          refName,
          Math.max(0, Math.min(target.animation.frameCount - 1, instance)),
          options,
          calculatedState.matrix,
          opacity,
          path,
          [...stack, key],
          depth + 1,
        );
        commands.push(...child.commands);
      }
    } else if (state.part.type === PartType.Effect && state.part.effect) {
      const effect = file.project.effects.find((e) => e.name === state.part.effect);
      if (effect)
        commands.push(
          ...evaluateEffect(
            file.project,
            effect,
            (options.time ?? frame / animation.fps) * effect.fps,
            calculatedState.matrix,
            opacity,
            path,
            options.seed ?? 0,
          ),
        );
    } else if (cell && state.part.type === PartType.Normal)
      commands.push(makeCommand(cell, state.cellIndex, state, matrix, path, opacity));
  }
  return { frame, pack, animation, parts, commands, userData: decoded.userData };
}
