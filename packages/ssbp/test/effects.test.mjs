import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSsbp } from '../dist/index.js';
import { evaluateEffect } from '../dist/effects.js';
import { identity } from '../dist/math.js';

const source = readFileSync(
  new URL('../../../ch00_04_Veronica_F_Normal/ch00_04_Veronica_F_Normal.ssbp', import.meta.url),
);

function effectFixture() {
  const bytes = Buffer.alloc(source.length + 512);
  source.copy(bytes);
  const effectOffset = source.length,
    nodesOffset = effectOffset + 16,
    listOffset = nodesOffset + 48;
  bytes.writeUInt32LE(effectOffset, 24);
  bytes.writeInt16LE(1, 32);
  const nameOffset = effectOffset + 450;
  bytes.write('test_effect\0', nameOffset);
  bytes.writeUInt32LE(nameOffset, effectOffset);
  bytes.writeInt16LE(30, effectOffset + 4);
  bytes.writeInt16LE(1, effectOffset + 6);
  bytes.writeInt16LE(4, effectOffset + 8);
  bytes.writeInt16LE(3, effectOffset + 10);
  bytes.writeUInt32LE(nodesOffset, effectOffset + 12);
  for (let index = 0; index < 3; index++) {
    const n = nodesOffset + index * 16;
    bytes.writeInt16LE(index, n);
    bytes.writeInt16LE(index - 1, n + 2);
    bytes.writeInt16LE(index, n + 4);
    bytes.writeInt16LE(index === 1 ? 0 : -1, n + 6);
    bytes.writeInt16LE(0, n + 8);
  }
  const behaviors = [
    [1, 'iiiiiffiiff', [0, 12, 1, 2, 20, 1, 3, 12, 16, 0, 40]],
    [4, 'ff', [0, -0.15]],
    [5, 'ffff', [-2, 2, -2, 2]],
    [6, 'ffff', [0, 90, -2, 2]],
    [10, 'uu', [0xffff8844, 0xffff8844]],
    [11, 'uu', [0x88ffffff, 0x88ffffff]],
    [12, 'ff', [0, 80]],
    [13, 'ffffff', [0.2, 0.2, 0.2, 0.2, 1, 1]],
    [14, 'ffffff', [0.4, 0.4, 0.4, 0.4, 1, 1]],
  ];
  bytes.writeInt16LE(behaviors.length, nodesOffset + 16 + 10);
  bytes.writeUInt32LE(listOffset, nodesOffset + 16 + 12);
  let offset = listOffset + behaviors.length * 4;
  behaviors.forEach(([type, layout, values], i) => {
    bytes.writeUInt32LE(offset, listOffset + i * 4);
    bytes.writeInt32LE(type, offset);
    offset += 4;
    [...layout].forEach((t, j) => {
      if (t === 'f') bytes.writeFloatLE(values[j], offset);
      else if (t === 'u') bytes.writeUInt32LE(values[j], offset);
      else bytes.writeInt32LE(values[j], offset);
      offset += 4;
    });
  });
  return bytes;
}

test('reads binary effect nodes, signed integers, floating parameters and ARGB colors', () => {
  const file = readSsbp(effectFixture()),
    effect = file.project.effects[0];
  assert.equal(effect.name, 'test_effect');
  assert.equal(effect.fps, 30);
  assert.equal(effect.lockSeed, true);
  assert.equal(effect.nodes.length, 3);
  assert.equal(effect.nodes[1].behaviors.length, 9);
  assert.equal(effect.nodes[1].behaviors.find((b) => b.type === 10).values[0], 0xffff8844);
  assert.ok(Math.abs(effect.nodes[1].behaviors.find((b) => b.type === 4).values[1] + 0.15) < 1e-6);
});

test('particle seeking is deterministic, supports alpha/color/size evolution and emitter lifetime', () => {
  const file = readSsbp(effectFixture()),
    effect = file.project.effects[0];
  const frame = evaluateEffect(file.project, effect, 8, identity(), 1, 'test', 0);
  assert.ok(frame.length > 0);
  assert.deepEqual(evaluateEffect(file.project, effect, 8, identity(), 1, 'test', 0), frame);
  assert.notDeepEqual(evaluateEffect(file.project, effect, 9, identity(), 1, 'test', 0), frame);
  assert.ok(
    frame.every(
      (c) =>
        c.colorBlend === 4 &&
        c.vertices.every((v) => [...v.color, v.x, v.y].every(Number.isFinite)),
    ),
  );
  assert.ok(frame.some((c) => c.vertices[0].color[3] < 1));
  assert.equal(evaluateEffect(file.project, effect, 60, identity(), 1, 'test', 0).length, 0);
});

test('unknown effect commands fail with a precise format error', () => {
  const bytes = effectFixture(),
    nodeOffset = bytes.readUInt32LE(24) + 16,
    listOffset = bytes.readUInt32LE(nodeOffset + 16 + 12),
    behavior = bytes.readUInt32LE(listOffset);
  bytes.writeInt32LE(999, behavior);
  assert.throws(() => readSsbp(bytes), /Unknown effect command: 999/);
});
