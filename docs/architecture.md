# Architecture and C++ viewer port

## Data flow

```text
ArrayBuffer / Uint8Array
          │
          ▼
@ssbp/core: SSBP v3 reader
          │  Project / AnimePack / Animation / CellMap
          ▼
decodeFrame → evaluateFrame / SsbpPlayer
          │  DrawCommand[]: geometry, atlas, UVs, colors, opacity
          ▼
@ssbp/viewer: WebGLRenderer
          │  HTMLImageElement → WebGL texture
          ▼
WebGL 2 + GLSL ES 3.00 → screen / PNG with alpha
```

The renderer and React belong exclusively to the viewer package. The library does not import DOM types or use browser APIs. Example images are copied to `packages/viewer/public/demo` without modifying the originals.

## Mapping to the original code

| C++                                      | TypeScript                                                 |
| ---------------------------------------- | ---------------------------------------------------------- |
| `SS5PlayerData.h`                        | `packages/ssbp/src/model.ts`, `reader.ts`                  |
| `ToPointer`, `DataArrayReader`           | `packages/ssbp/src/binary.ts`                              |
| `Player::setFrame`, matrices, and pivots | `packages/ssbp/src/evaluate.ts`, `math.ts`                 |
| `Player` timing                          | `packages/ssbp/src/player.ts`                              |
| Effect cache and commands                | `reader.ts`, `effects.ts`                                  |
| `Texture`, `SSTextureLoad`               | `packages/viewer/src/assets/files.ts`, `renderer/webgl.ts` |
| `SSDrawSprite`, OpenGL shaders           | `packages/viewer/src/renderer/webgl.ts`                    |
| Capture using `glReadPixels`             | `renderer/webgl.ts`, `renderer/png.ts`                     |

## Important format details

- Signature `0x42505353`, version 3, and little-endian reads.
- The 32-bit offsets point to the beginning of the file, not to the field containing them.
- C++ structures include padding: `ProjectData` occupies 36 bytes, `Cell` 28, `PartData` 28, `AnimationData` 32, and `AnimationInitialData` 80.
- A frame starts with a table of parts in draw order. Each part contains an index, flags, and optional values, falling back to its initial values.
- Positions are stored as integers with ten units per pixel. Vertex deformation values use their own scale and are not divided by `DOT`.
- Children inherit matrices without pivot offsets. Pivot offsets affect only the sprite's geometry.
- Instance parameters are read after vertex deformation and colors. Infinite loop, reverse, ping-pong, and independent playback flags are preserved.
- Independent animations are evaluated with explicit time and a deterministic seed, allowing seeking without depending on previous evaluations. Their phase may differ from a C++ screenshot whose instance had been playing for a different length of time.
- Image paths may contain Windows separators, subdirectories, and parent directory references. The loader tries paths first, then filenames only when the match is unambiguous.

## Rendering

The viewer requests `webgl2` with premultiplied alpha. Textures are uploaded without premultiplication or Y flipping; the format's UVs use a top-left origin. The shader outputs premultiplied color, and blending preserves the framebuffer's alpha. Mix, multiply, add, and subtract modes are configured separately from per-vertex color blending.

Each sprite uses the same two triangles as the C++ quad. Wireframe rendering uses `LINE_LOOP`, because WebGL does not expose `glPolygonMode`. Wrap and filter settings come from the SSBP atlases. Shaders, buffers, and textures are restored when the browser recovers a lost graphics context.

PNG export redraws the frame, reads the framebuffer, reverses the rows, and converts premultiplied alpha to straight RGBA. The PNG encoder uses `CompressionStream` and CRC32, without a Canvas 2D context. The grid, axes, and panels are interface elements and are not exported.

GIF export creates a second WebGL context with the current framing and evaluates every frame without moving the main player. A locally bundled `gifenc` worker reverses rows, converts alpha, reduces the palette to 255 opaque colors, and reserves index zero for transparency. Each frame is cleared before drawing the next (`dispose = 2`) to avoid trails. Frame delays accumulate rounding to hundredths of a second; at 30 FPS, delays alternate between 30 and 40 ms. Playback speed and direction are preserved; the loop setting controls the GIF's repeat extension. Cancellation terminates the worker and releases the auxiliary context.

## GitHub Pages

The `.github/workflows/pages.yml` workflow installs dependencies using `npm ci`, runs tests, and builds both packages. It publishes only the static contents of `packages/viewer/dist`, using an artifact and the official Pages action. The deployment job has `pages: write` and `id-token: write` permissions; the build job can only read the repository. Deployment is restricted to the default branch and can be triggered manually.

Vite's relative `base` applies to HTML, assets, example images, and the worker URL. `scripts/pages-smoke.mjs` serves the production build under `/ssbpViewerJs/` and tests downloads and actual GIF contents, verifying resources with the same path structure used by Pages.

## Verification and limitations

Unit tests cover every frame in the example, buffer views with offsets, truncated files, indices and cycles, timing controls, instances, hidden subtrees, and UVs. Synthetic effect tests verify binary reading and deterministic behavior. Chromium tests check rendering, a PNG with alpha, controls, atlases, file loading, the absence of external requests, and the absence of horizontal overflow on mobile.

`test:browser` also saves `cpp-camera.png`, rendered with the C++ code's initial 512 × 512 camera, for comparison with the reference screenshot. Camera positions in manually captured screenshots and the phase of independent instances may vary.

The example does not allow particles to be checked against a real animation. The effect simulator implements the available behaviors deterministically; exact equivalence of emission timing, seeds, and nested emitters across all C++ projects still needs real fixtures. Reserved text parts are not rendered. SSBP versions other than 3 are explicitly rejected.
