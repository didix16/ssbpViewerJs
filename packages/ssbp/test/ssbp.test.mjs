import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  readSsbp,
  evaluateFrame,
  SsbpPlayer,
  SsbpError,
  instanceFrame,
  textureCoordinates,
} from '../dist/index.js';

const sample = readFileSync(
  new URL('../../../ch00_04_Veronica_F_Normal/ch00_04_Veronica_F_Normal.ssbp', import.meta.url),
);
const file = readSsbp(sample);

test('reads the real v3 project, atlas paths, packs and animations', () => {
  assert.equal(file.project.version, 3);
  assert.equal(file.project.cells.length, 52);
  assert.deepEqual(
    file.project.packs.map((p) => [p.name, p.parts.length, p.animations.length]),
    [
      ['body_anim', 52, 10],
      ['mant_anim', 2, 1],
    ],
  );
  assert.equal(file.getAnimation('body_anim', 'Idle').animation.frameCount, 80);
  assert.equal(file.getAnimation('body_anim', 'Attack2_Loop').animation.fps, 30);
  assert.ok(file.project.cellMaps.some((m) => m.imagePath === 'tex/Body_AllTex.png'));
  assert.equal(file.project.imageBaseDir, '');
});

test('accepts sliced Uint8Arrays without resolving offsets against the containing buffer', () => {
  const padded = new Uint8Array(sample.length + 53);
  padded.set(sample, 37);
  assert.deepEqual(readSsbp(padded.subarray(37, 37 + sample.length)).project, file.project);
});

test('rejects bad signatures, unsupported versions, truncated and out-of-bounds tables', () => {
  for (const length of [0, 4, 35, 80])
    assert.throws(() => readSsbp(sample.subarray(0, length)), SsbpError);
  const signature = Uint8Array.from(sample);
  signature[0] = 0;
  assert.throws(() => readSsbp(signature), /firma SSBP/);
  const version = Uint8Array.from(sample);
  version[4] = 99;
  assert.throws(() => readSsbp(version), /Versión SSBP 99/);
  const table = Uint8Array.from(sample);
  new DataView(table.buffer).setUint32(16, table.length - 1, true);
  assert.throws(() => readSsbp(table), /fuera del archivo/);
});

test('rejects cyclic part hierarchies', () => {
  const corrupt = Uint8Array.from(sample),
    view = new DataView(corrupt.buffer);
  const parts = view.getUint32(view.getUint32(20, true) + 4, true);
  view.setInt16(parts + 6, 1, true);
  assert.throws(() => readSsbp(corrupt), /Ciclo/);
});

test('decodes and evaluates all 306 sample frames including nested cloak instances', () => {
  let frames = 0,
    nested = 0;
  for (const pack of file.project.packs)
    for (const animation of pack.animations)
      for (let frame = 0; frame < animation.frameCount; frame++) {
        const result = evaluateFrame(file, pack.name, animation.name, frame);
        assert.equal(result.parts.length, pack.parts.length);
        assert.ok(result.commands.length > 0);
        for (const command of result.commands) {
          if (command.path.split('/').length > 2) nested++;
          assert.equal(command.vertices.length, 4);
          for (const vertex of command.vertices)
            assert.ok(
              [vertex.x, vertex.y, vertex.z, vertex.u, vertex.v, ...vertex.color].every(
                Number.isFinite,
              ),
            );
          assert.ok(command.opacity >= 0 && command.opacity <= 1);
        }
        frames++;
      }
  assert.equal(frames, 306);
  assert.ok(nested > 0);
});

test('validates frame ranges and missing animations', () => {
  assert.throws(() => file.decodeFrame('body_anim', 'Idle', -1), /fuera de rango/);
  assert.throws(() => file.decodeFrame('body_anim', 'Idle', 80), /fuera de rango/);
  assert.throws(() => file.decodeFrame('body_anim', 'Idle', 0.5), /fuera de rango/);
  assert.throws(() => file.getAnimation('body_anim', 'missing'), /no encontrada/);
});

test('hiding a parent hides its entire subtree and instance commands', () => {
  const result = evaluateFrame(file, 'body_anim', 'Idle', 0, {
    hiddenParts: new Set(['body_anim/0']),
  });
  assert.equal(result.commands.length, 0);
});

test('seeking is deterministic independently of previous reads', () => {
  const before = evaluateFrame(file, 'body_anim', 'Attack2_Loop', 8);
  evaluateFrame(file, 'body_anim', 'Idle', 42);
  assert.deepEqual(evaluateFrame(file, 'body_anim', 'Attack2_Loop', 8), before);
});

test('player uses animation FPS, loops, reverse playback, and stops without looping', () => {
  const p = new SsbpPlayer(file, 'body_anim', 'Attack2_Loop');
  p.playing = true;
  p.update(1 / 30);
  assert.equal(p.frame, 1);
  p.seek(8);
  p.update(1 / 30);
  assert.equal(p.frame, 0);
  p.speed = -1;
  p.update(1 / 30);
  assert.equal(p.frame, 8);
  p.loop = false;
  p.speed = 1;
  p.seek(8);
  p.update(1 / 30);
  assert.equal(p.frame, 8);
  assert.equal(p.playing, false);
  p.select('mant_anim', 'mant');
  assert.equal(p.frame, 0);
});

test('instance loop flags support reverse, ping-pong, independent time and start delay', () => {
  const state = { keyframe: 0, start: 2, end: 4, speed: 1, loops: 1, flags: 1 };
  assert.equal(instanceFrame(state, 0), 2);
  assert.equal(instanceFrame(state, 3), 2);
  assert.equal(instanceFrame({ ...state, flags: 3 }, 0), 4);
  assert.equal(instanceFrame({ ...state, flags: 5 }, 3), 4);
  assert.equal(instanceFrame({ ...state, flags: 9 }, 0, 1), 3);
  assert.equal(instanceFrame({ ...state, keyframe: 2 }, 1), null);
});

test('atlas UVs are normalized with the actual image dimensions', () => {
  const result = evaluateFrame(file, 'body_anim', 'Attack2_Loop', 8);
  const command = result.commands.find((c) => c.cellMap.imagePath === 'tex/Body_AllTex.png');
  const uv = textureCoordinates(command, 512, 512);
  assert.equal(uv.length, 4);
  assert.ok(uv.flat().every(Number.isFinite));
  assert.ok(Math.abs(uv[1][0] - uv[0][0]) <= 1);
});
