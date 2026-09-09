import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { Jimp } from 'jimp';
import { prepareGif } from '../src/gif.js';
const { GifWriter } = createRequire(import.meta.url)('omggif');

function fixture(disposal: number, loops?: number) {
  const bytes = Buffer.alloc(4096);
  const writer = new GifWriter(bytes, 2, 1, { palette: [0, 0xff0000, 0x00ff00, 0x0000ff], ...(loops === undefined ? {} : { loop: loops }) });
  writer.addFrame(0, 0, 2, 1, [1, 1], { delay: 20 });
  writer.addFrame(0, 0, 1, 1, [2], { delay: 15, disposal });
  writer.addFrame(0, 0, 2, 1, [0, 3], { delay: 1, transparent: 0 });
  return bytes.subarray(0, writer.end());
}

for (const disposal of [1, 2, 3]) {
  test(`GIF composes transparent patches and disposal ${disposal}`, async () => {
    const animation = (await prepareGif(fixture(disposal, 0)))!;
    assert.equal(animation.frames.length, 3);
    assert.equal(animation.loops, 0);
    assert.deepEqual(animation.frames.map(f => f.delay), [200, 150, 100]);
    const decoded = await Jimp.read(animation.frames[2]!.source);
    assert.equal(decoded.getPixelColor(0, 0), disposal === 1 ? 0x00ff00ff : disposal === 2 ? 0 : 0xff0000ff);
    assert.equal(decoded.getPixelColor(decoded.bitmap.width - 1, 0), 0x0000ffff);
  });
}
test('GIF preserves absent and finite loop counts', async () => {
  assert.equal((await prepareGif(fixture(1)))!.loops, null);
  assert.equal((await prepareGif(fixture(1, 2)))!.loops, 2);
});
test('non-GIF and excessive dimensions use static rendering', async () => {
  assert.equal(await prepareGif(Buffer.from('not a gif')), undefined);
  const bytes = fixture(1);
  bytes.writeUInt16LE(65535, 6);
  bytes.writeUInt16LE(65535, 8);
  assert.equal(await prepareGif(bytes), undefined);
});

test('GIF retains native preview detail above the old 112 pixel limit', async () => {
  const bytes = Buffer.alloc(65536);
  const writer = new GifWriter(bytes, 280, 160, { palette: [0, 0xffffff], loop: 0 });
  const pixels = new Uint8Array(280 * 160);
  for (let i = 0; i < pixels.length; i++) pixels[i] = i % 2;
  writer.addFrame(0, 0, 280, 160, pixels, { delay: 10 });
  writer.addFrame(0, 0, 280, 160, pixels, { delay: 10 });
  const animation = (await prepareGif(bytes.subarray(0, writer.end())))!;
  const image = await Jimp.read(animation.frames[0]!.source);
  assert.equal(image.bitmap.width, 280);
  assert.equal(image.bitmap.height, 160);
  assert.equal(image.getPixelColor(0, 0), 0x000000ff);
  assert.equal(image.getPixelColor(1, 0), 0xffffffff);
});
