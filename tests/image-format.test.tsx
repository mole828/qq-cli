import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactCQ } from '../src/message-format.js';
import { setImageFormat } from '../src/image-format.js';

test('image format updates the existing linked and plain token for extensionless URLs', () => {
  const url = 'https://example.com/download?id=1&key=2';
  const cq = '[CQ:image,url=https://example.com/download?id=1&amp;key=2]';
  assert.equal(compactCQ(cq), '[image]');
  try {
    for (const format of ['GIF', 'JPEG', 'PNG']) {
      setImageFormat(url, `image/${format.toLowerCase()}`);
      assert.equal(compactCQ(cq), `[image, ${format}]`);
      const linked = compactCQ(cq, { terminalLinks: true });
      assert.ok(linked.includes(`[image, ${format}]`));
      assert.ok(!linked.includes('[image]'));
    }
  } finally {
    setImageFormat(url);
  }
  assert.equal(compactCQ(cq), '[image]');
});
