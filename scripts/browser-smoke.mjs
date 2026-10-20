import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const port = 5174;
const server = spawn(
  process.execPath,
  [
    new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname.replace(
      /^\/(?=[A-Za-z]:)/,
      '',
    ),
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { cwd: new URL('../packages/viewer/', import.meta.url), windowsHide: true, stdio: 'pipe' },
);
let serverOutput = '';
server.stdout.on('data', (d) => {
  serverOutput += d;
});
server.stderr.on('data', (d) => {
  serverOutput += d;
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(ready, `The server did not start: ${serverOutput}`);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SSBP_BROWSER_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1586, height: 946 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(10000);
  const errors = [],
    network = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (
      !new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/) &&
      !r.url().startsWith('blob:')
    )
      network.push(r.url());
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Current frame' }).fill('8');
  await page.getByRole('heading', { name: 'SSBP Viewer', exact: true }).click();
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  await page.screenshot({
    path: new URL('../test-results/viewer-desktop.png', import.meta.url).pathname.replace(
      /^\/(?=[A-Za-z]:)/,
      '',
    ),
  });

  // Export a real WebGL frame and validate the PNG scanlines and alpha.
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
  const download = await downloadEvent,
    pngPath = new URL('../test-results/Attack2_Loop_8.png', import.meta.url);
  assert.match(download.suggestedFilename(), /Attack2_Loop_008\.png$/);
  await download.saveAs(pngPath.pathname.replace(/^\/(?=[A-Za-z]:)/, ''));
  const png = await readFile(pngPath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20),
    chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset),
      type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const pixels = inflateSync(Buffer.concat(chunks));
  let transparent = 0,
    opaque = 0,
    partial = 0;
  for (let y = 0; y < height; y++) {
    assert.equal(pixels[y * (width * 4 + 1)], 0);
    for (let x = 0; x < width; x++) {
      const alpha = pixels[y * (width * 4 + 1) + 1 + x * 4 + 3];
      if (alpha === 0) transparent++;
      else if (alpha === 255) opaque++;
      else partial++;
    }
  }
  assert.ok(transparent > (width * height) / 2 && opaque > 1000 && partial > 100);

  // Search, animation selection, seeking, visibility, view controls and keyboard.
  await page.getByRole('textbox', { name: 'Search animations' }).fill('idle');
  assert.equal(await page.locator('.animation-item').count(), 1);
  await page.getByRole('button', { name: /^Idle/ }).click();
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Current frame' }).fill('10');
  await page.getByRole('button', { name: 'Next frame', exact: true }).click();
  assert.equal(await page.getByRole('spinbutton', { name: 'Current frame' }).inputValue(), '11');
  await page.getByRole('button', { name: 'Hide root', exact: true }).click();
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  assert.equal(
    await page
      .locator('.property-list>div')
      .filter({ hasText: /^Sprites/ })
      .locator('dd')
      .innerText(),
    '0',
  );
  await page.getByRole('tab', { name: 'Inspector', exact: true }).click();
  await page.getByRole('button', { name: 'Show root', exact: true }).click();
  await page.getByRole('button', { name: 'Flip horizontally', exact: true }).click();
  assert.equal(
    await page
      .getByRole('button', { name: 'Flip horizontally', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await page.getByRole('button', { name: 'Flip horizontally', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Grid', exact: true }).uncheck();
  assert.ok(!(await page.locator('.stage').getAttribute('class')).includes('checker'));
  await page.getByRole('checkbox', { name: 'Grid', exact: true }).check();

  await page.getByRole('tab', { name: 'Textures', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect Body_AllTex.png', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show cells', exact: true }).check();
  assert.equal(await page.locator('.cell-overlay rect').count(), 43);
  await page.screenshot({
    path: new URL('../test-results/viewer-atlas.png', import.meta.url).pathname.replace(
      /^\/(?=[A-Za-z]:)/,
      '',
    ),
  });
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: /Shortcuts/ }).click();
  assert.ok(await page.getByRole('dialog', { name: 'Keyboard shortcuts' }).isVisible());
  await page.keyboard.press('Escape');

  // Local file loading works with the misleading .png extensions too.
  await page
    .locator('input[type=file]:not([webkitdirectory])')
    .setInputFiles(
      [
        new URL('../ch00_04_Veronica_F_Normal/ch00_04_Veronica_F_Normal.ssbp', import.meta.url),
        new URL('../ch00_04_Veronica_F_Normal/tex/Body_AllTex.png', import.meta.url),
        new URL('../ch00_04_Veronica_F_Normal/tex/Option_Tex.png', import.meta.url),
      ].map((u) => u.pathname.replace(/^\/(?=[A-Za-z]:)/, '')),
    );
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await page.getByRole('tab', { name: 'Inspector', exact: true }).click();
  assert.equal(
    await page.getByRole('button', { name: 'Inspect Body_AllTex.png', exact: true }).count(),
    1,
  );

  // Reference render at the C++ viewer's exact 512 × 512 camera transform.
  const coreUrl =
    '/@fs/' +
    fileURLToPath(new URL('../packages/ssbp/dist/index.js', import.meta.url)).replaceAll('\\', '/');
  const oracle = await page.evaluate(async (coreUrl) => {
    const [{ WebGLRenderer }, { loadDemo }, core] = await Promise.all([
      import('/src/renderer/webgl.ts'),
      import('/src/assets/files.ts'),
      import(coreUrl),
    ]);
    const project = await loadDemo();
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;left:-1000px;top:0;width:512px;height:512px';
    document.body.append(canvas);
    const renderer = new WebGLRenderer(canvas);
    renderer.setTextures(project.textures);
    renderer.camera.x = 0;
    renderer.camera.y = 128;
    renderer.render(core.evaluateFrame(project.file, 'body_anim', 'Attack2_Loop', 8).commands);
    const png = await renderer.exportPng(),
      bytes = [...new Uint8Array(await png.arrayBuffer())];
    renderer.dispose();
    canvas.remove();
    project.release();
    return bytes;
  }, coreUrl);
  if (oracle)
    await writeFile(
      new URL('../test-results/cpp-camera.png', import.meta.url),
      new Uint8Array(oracle),
    );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: new URL('../test-results/viewer-mobile.png', import.meta.url).pathname.replace(
      /^\/(?=[A-Za-z]:)/,
      '',
    ),
    fullPage: true,
  });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  assert.deepEqual(network, [], 'The viewer must work without requests to external services');
  assert.deepEqual(errors, []);
  console.log(
    `Browser OK: WebGL 2, PNG ${width}×${height} with alpha, playback, search, layers, atlases, local files, and mobile layout.`,
  );
} finally {
  await browser?.close();
  server.kill();
}
