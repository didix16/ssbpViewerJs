# @ssbp/core

An ESM TypeScript library for reading SpriteStudio SSBP v3 files and evaluating their animations. It works in Node.js and browsers without runtime dependencies or file system access.

```ts
import { readSsbp, evaluateFrame, SsbpPlayer } from '@ssbp/core';

const response = await fetch('/character.ssbp');
const file = readSsbp(await response.arrayBuffer());

console.log(file.project.cells);
console.log(file.project.cellMaps);
console.log(file.project.packs);

const decoded = file.decodeFrame('body_anim', 'Idle', 0);
const scene = evaluateFrame(file, 'body_anim', 'Idle', 0);
// scene.commands: sprites in draw order, including instances and particles.
// scene.parts: states and matrices for parts in the main animation.
// scene.userData: events for the selected frame.

const player = new SsbpPlayer(file, 'body_anim', 'Idle');
player.playing = true;
player.loop = true;
player.update(1 / 60); // The host provides elapsed time in seconds.
const nextScene = player.evaluate();
```

In Node.js, you can pass the `Buffer` returned by `readFile` directly. `Uint8Array` views into larger buffers are also accepted: all offsets are relative to the supplied view.

## API

- `readSsbp(buffer)` / `new SsbpFile(buffer)`: validate and read a file.
- `file.project`: cells, atlases, packs, parts, animations, labels, and effects.
- `file.getAnimation(pack, animation)`: find an animation or throw `SsbpError`.
- `file.decodeFrame(pack, animation, frame)`: local states in draw order and user data. Frames are indexed from zero.
- `evaluateFrame(file, pack, animation, frame, options?)`: apply matrices and pivots and evaluate instances and effects.
- `textureCoordinates(command, width, height)`: convert atlas coordinates to normalized UVs and apply the format's UV operations.
- `SsbpPlayer`: `select`, `seek`, `update`, `evaluate`, `playing`, `loop`, and `speed`.
- `SsbpError`: a format error, including the byte offset when known.

`EvaluateOptions.hiddenParts` accepts a set of paths such as `body_anim/3` to hide parts and their descendants. Instances use nested paths, such as `body_anim/48/1`. `time` supplies absolute time in seconds for independent instances and effects; it defaults to `frame / fps`. `seed` controls effects that do not specify their own seed.

Positions are returned in pixels, with positive Y pointing up and rotations in degrees. Matrices are 4 × 4 in column-major order, matching OpenGL. Each command's vertices are ordered **top left, top right, bottom left, bottom right**; their UVs initially use atlas pixels. Command colors and opacity are normalized to 0–1. Each command keeps the sprite blend mode separate from the color blend mode.

The library does not load images: the consumer resolves `cellMap.imagePath` and supplies each atlas's dimensions to the renderer. Exposed objects should be treated as read-only data; decoded frames use a bounded cache.

## Compatibility

The reader validates the signature, version, ranges, offsets, indices, and hierarchy cycles. Structure sizes include the original C++ runtime's four-byte alignment. Parts are not assumed to be stored in draw order.

Only version 3 is supported. Effects include commands 0–16 from the reference runtime and half-frame simulation using MT19937. Fidelity against real projects with complex effects still needs validation; the included tests use synthetic data. Instance depth is limited to 16, emitter chains to 8, and effect simulation to 18000 frames. Exceeding a limit throws `SsbpError`.
