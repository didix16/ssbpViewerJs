import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const directory = fileURLToPath(new URL('../packages/viewer/dist/', import.meta.url));
const prefix = '/ssbpViewerJs/';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ssbp': 'application/octet-stream',
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) {
      response.writeHead(404).end();
      return;
    }
    const target = resolve(directory, pathname.slice(prefix.length) || 'index.html');
    if (!target.startsWith(resolve(directory) + sep)) {
      response.writeHead(403).end();
      return;
    }
    response
      .writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream' })
      .end(await readFile(target));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${prefix}`;

function parseGif(bytes) {
  assert.equal(bytes.toString('ascii', 0, 6), 'GIF89a');
  const width = bytes.readUInt16LE(6),
    height = bytes.readUInt16LE(8),
    frames = [];
  let offset = 13 + (bytes[10] & 128 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0),
    gce = {};
  const blocks = () => {
    const chunks = [];
    while (bytes[offset]) {
      const length = bytes[offset++];
      chunks.push(bytes.subarray(offset, offset + length));
      offset += length;
      assert.ok(offset < bytes.length);
    }
    offset++;
    return Buffer.concat(chunks);
  };
  while (bytes[offset] !== 0x3b) {
    const marker = bytes[offset++];
    if (marker === 0x21) {
      const type = bytes[offset++];
      if (type === 0xf9) {
        assert.equal(bytes[offset++], 4);
        const flags = bytes[offset++];
        gce = {
          delay: bytes.readUInt16LE(offset) * 10,
          transparent: !!(flags & 1),
          dispose: (flags >> 2) & 7,
        };
        offset += 4;
      } else blocks();
    } else if (marker === 0x2c) {
      const packed = bytes[offset + 8];
      offset += 9;
      if (packed & 128) offset += 3 * (1 << ((packed & 7) + 1));
      offset++;
      const image = blocks();
      frames.push({ ...gce, hash: createHash('sha256').update(image).digest('hex') });
    } else assert.fail(`Bloque GIF desconocido ${marker} en ${offset - 1}`);
  }
  return { width, height, frames, loop: bytes.includes(Buffer.from('NETSCAPE2.0')) };
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SSBP_BROWSER_PATH || undefined,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1586, height: 946 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(20000);
  const errors = [],
    failedRequests = [],
    downloads = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`);
  });
  page.on('request', (request) => {
    const target = new URL(request.url());
    if (target.protocol !== 'blob:')
      assert.ok(
        target.pathname.startsWith(prefix),
        `Ruta fuera de GitHub Pages: ${target.pathname}`,
      );
  });
  page.on('download', (download) => downloads.push(download));
  await page.goto(url);
  await page.getByRole('button', { name: 'Pausar animación', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Fotograma actual' }).fill('8');
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true });
  const nextDownload = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Exportar GIF', exact: true }).click();
  const forward = await nextDownload;
  assert.equal(forward.suggestedFilename(), 'body_anim_Attack2_Loop.gif');
  const forwardPath = new URL('../test-results/Attack2_Loop.gif', import.meta.url);
  await forward.saveAs(fileURLToPath(forwardPath));
  await page
    .getByRole('dialog', { name: 'Exportando GIF', exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('spinbutton', { name: 'Fotograma actual' }).inputValue(), '8');
  assert.ok(
    await page.getByRole('button', { name: 'Reproducir animación', exact: true }).isVisible(),
  );
  const gif = parseGif(await readFile(forwardPath));
  assert.equal(gif.frames.length, 9);
  assert.equal(
    gif.frames.reduce((n, f) => n + f.delay, 0),
    300,
  );
  assert.ok(gif.loop && gif.frames.every((f) => f.transparent && f.dispose === 2));
  assert.ok(new Set(gif.frames.map((f) => f.hash)).size > 1);
  console.log(
    'GIF forward:',
    gif.width,
    gif.height,
    gif.frames.length,
    'frames,',
    gif.frames.map((f) => f.delay),
    'ms',
  );

  // Reverse order and disabled looping must be reflected in the downloaded animation.
  await page.getByRole('combobox', { name: 'Velocidad de reproducción' }).selectOption('-1');
  await page.getByRole('checkbox', { name: 'Bucle', exact: true }).uncheck();
  const reverseDownload = page.waitForEvent('download', { timeout: 60000 });
  await page.getByRole('button', { name: 'Exportar GIF', exact: true }).click();
  const reverse = await reverseDownload,
    reversePath = new URL('../test-results/Attack2_Loop-reverse.gif', import.meta.url);
  await reverse.saveAs(fileURLToPath(reversePath));
  await page
    .getByRole('dialog', { name: 'Exportando GIF', exact: true })
    .waitFor({ state: 'hidden' });
  const reversed = parseGif(await readFile(reversePath));
  assert.equal(reversed.loop, false);
  assert.deepEqual(
    reversed.frames.map((f) => f.hash),
    gif.frames.map((f) => f.hash).reverse(),
  );

  await page.getByRole('button', { name: /^Idle/ }).click();
  await page.getByRole('button', { name: 'Pausar animación', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Fotograma actual' }).fill('17');
  await page.getByRole('button', { name: 'Exportar GIF', exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar exportación', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Exportando GIF', exact: true })
    .waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('spinbutton', { name: 'Fotograma actual' }).inputValue(), '17');
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(downloads.length, 2);

  await page.getByRole('button', { name: /^Attack2_Loop/ }).click();
  await page.getByRole('button', { name: 'Pausar animación', exact: true }).click();
  await page.getByRole('heading', { name: 'SSBP Viewer', exact: true }).click();
  await page.screenshot({
    path: fileURLToPath(new URL('../test-results/viewer-pages-gif.png', import.meta.url)),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({
    path: fileURLToPath(new URL('../test-results/viewer-pages-gif-mobile.png', import.meta.url)),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  console.log(
    'Pages OK: production under /ssbpViewerJs/, worker, demo, GIF transparency/duration/reverse/loop, cancel and mobile.',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
