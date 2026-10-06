import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Jimp } from 'jimp';
import { createImagePreparationQueue, prepareImageThumbnail } from '../src/image-preparation.js';

test('large originals retain layout metadata but render from a bounded bitmap', async () => {
  const original = new Jimp({ width: 3840, height: 2160, color: 0x123456ff });
  const thumbnail = await prepareImageThumbnail(await original.getBuffer('image/png'));
  assert.equal(thumbnail.mime, 'image/png');
  assert.deepEqual(thumbnail.dimensions, { width: 3840, height: 2160 });
  const rendered = await Jimp.read(thumbnail.bytes);
  assert.equal(rendered.bitmap.width, 560);
  assert.equal(rendered.bitmap.height, 315);
  assert.equal(rendered.getPixelColor(0, 0), 0x123456ff);
  assert.ok(rendered.bitmap.data.length < original.bitmap.data.length / 40);
});

test('local previews preserve transparency and do not upscale small images', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-cli-thumbnail-test-'));
  try {
    const original = new Jimp({ width: 20, height: 40, color: 0x12345600 });
    original.setPixelColor(0xff000080, 1, 1);
    const path = join(directory, 'image.png');
    await writeFile(path, await original.getBuffer('image/png'));
    const thumbnail = await prepareImageThumbnail(path);
    const rendered = await Jimp.read(thumbnail.bytes);
    assert.equal(rendered.bitmap.width, 20);
    assert.equal(rendered.bitmap.height, 40);
    assert.equal(rendered.getPixelColor(0, 0) & 0xff, 0);
    assert.equal(rendered.getPixelColor(1, 1), 0xff000080);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('GIF previews encode only the first frame and keep the original format metadata', async () => {
  const { GifWriter } = createRequire(import.meta.url)('omggif');
  const bytes = Buffer.alloc(4096);
  const writer = new GifWriter(bytes, 1, 1, { palette: [0xff0000, 0x00ff00] });
  writer.addFrame(0, 0, 1, 1, [0]);
  writer.addFrame(0, 0, 1, 1, [1]);
  const thumbnail = await prepareImageThumbnail(bytes.subarray(0, writer.end()));
  assert.equal(thumbnail.mime, 'image/gif');
  const rendered = await Jimp.read(thumbnail.bytes);
  assert.equal(rendered.mime, 'image/png');
  assert.equal(rendered.getPixelColor(0, 0), 0xff0000ff);
});

test('image preparation limits concurrency and drains its queue after failures', async () => {
  const run = createImagePreparationQueue(2);
  let active = 0;
  let peak = 0;
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => run(async () => {
    active++;
    peak = Math.max(peak, active);
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      if (index === 1) throw new Error('decode failed');
      return index;
    } finally {
      active--;
    }
  })));
  assert.equal(peak, 2);
  assert.equal(active, 0);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 7);
  assert.equal(results[1]!.status, 'rejected');
  assert.equal(await run(async () => 'next'), 'next');
});

test('invalid image data rejects without blocking subsequent preparation', async () => {
  const run = createImagePreparationQueue(1);
  const original = new Jimp({ width: 1, height: 1, color: 0xffffffff });
  const bytes = await original.getBuffer('image/png');
  const results = await Promise.allSettled([
    run(() => prepareImageThumbnail(Buffer.from('invalid image'))),
    run(() => prepareImageThumbnail(bytes)),
  ]);
  assert.equal(results[0]!.status, 'rejected');
  assert.equal(results[1]!.status, 'fulfilled');
});
