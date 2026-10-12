import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test} from 'node:test';
import measureText from '../node_modules/ink/build/measure-text.js';
import wrapText from '../node_modules/ink/build/wrap-text.js';
import {inkPatchTargets, patchInkCaches} from '../scripts/patch-ink-caches.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('Ink wrapping keeps text and width boundaries distinct and caches empty output correctly', () => {
	const narrowText = '012345678901';
	const wideText = '01234567890';
	assert.equal(narrowText + '2wrap', wideText + '12wrap', 'inputs collide with the old concatenated key');

	const narrowResult = wrapText(narrowText, 2, 'wrap');
	assert.notEqual(narrowResult, narrowText);
	assert.equal(wrapText(wideText, 12, 'wrap'), wideText);
	assert.equal(wrapText('', 12, 'wrap'), '');
	assert.equal(wrapText('', 12, 'wrap'), '');

	assert.deepEqual(measureText('a\nb'), {width: 1, height: 2});
	assert.deepEqual(measureText('ab'), {width: 2, height: 1});
	assert.deepEqual(measureText('\u001b[31m你好\u001b[39m\na'), {width: 4, height: 2});
	assert.equal(wrapText('你好世界', 4, 'wrap'), '你好\n世界');
});

test('Ink measurement evicts old entries, refreshes recent hits, and bypasses oversized text', () => {
	const recent = 'lru-recent';
	const dimensions = measureText(recent);
	for (let i = 0; i < 511; i++) measureText(`lru-before-${i}`);
	assert.equal(measureText(recent), dimensions);
	measureText('lru-next');
	assert.equal(measureText(recent), dimensions, 'a recently used entry survives eviction');
	for (let i = 0; i < 512; i++) measureText(`lru-after-${i}`);
	assert.notEqual(measureText(recent), dimensions, 'old dimensions are released');

	const budgetText = 'budget-first:' + 'x'.repeat(2000);
	const budgetDimensions = measureText(budgetText);
	for (let i = 0; i < 40; i++) measureText(`budget-${i}:` + 'x'.repeat(2000));
	assert.notEqual(measureText(budgetText), budgetDimensions, 'text size triggers eviction below the entry limit');
	const oversized = 'x'.repeat(9000);
	assert.notEqual(measureText(oversized), measureText(oversized), 'oversized text is measured without retention');
});

test('Ink patch applies both known files atomically and is repeatable', () => {
	const root = mkdtempSync(join(tmpdir(), 'qq-cli-ink-patch-'));
	try {
		mkdirSync(join(root, 'node_modules/ink'), {recursive: true});
		writeFileSync(join(root, 'node_modules/ink/package.json'), JSON.stringify({version: '7.1.0'}));
		for (const target of inkPatchTargets) {
			const file = join(root, target.path);
			mkdirSync(dirname(file), {recursive: true});
			writeFileSync(file, target.original);
		}

		patchInkCaches(root);
		for (const target of inkPatchTargets) {
			assert.equal(readFileSync(join(root, target.path), 'utf8'), target.patched);
		}

		patchInkCaches(root);
		for (const target of inkPatchTargets) {
			assert.equal(readFileSync(join(root, target.path), 'utf8'), target.patched);
		}
	} finally {
		rmSync(root, {recursive: true, force: true});
	}
});

test('Ink patch rejects unknown versions and sources without changing any target', () => {
	const root = mkdtempSync(join(tmpdir(), 'qq-cli-ink-patch-reject-'));
	try {
		mkdirSync(join(root, 'node_modules/ink'), {recursive: true});
		writeFileSync(join(root, 'node_modules/ink/package.json'), JSON.stringify({version: '7.1.1'}));
		for (const target of inkPatchTargets) {
			const file = join(root, target.path);
			mkdirSync(dirname(file), {recursive: true});
			writeFileSync(file, target.original);
		}
		assert.throws(() => patchInkCaches(root), /supports exactly 7\.1\.0/);
		for (const target of inkPatchTargets) {
			assert.equal(readFileSync(join(root, target.path), 'utf8'), target.original);
		}

		writeFileSync(join(root, 'node_modules/ink/package.json'), JSON.stringify({version: '7.1.0'}));
		const unknownPath = join(root, inkPatchTargets[1]!.path);
		writeFileSync(unknownPath, 'unknown Ink source');
		assert.throws(() => patchInkCaches(root), /source does not match/);
		assert.equal(readFileSync(join(root, inkPatchTargets[0]!.path), 'utf8'), inkPatchTargets[0]!.original);
		assert.equal(readFileSync(unknownPath, 'utf8'), 'unknown Ink source');
	} finally {
		rmSync(root, {recursive: true, force: true});
	}
});

test('Ink caches stay bounded after many unique message strings', () => {
	const measureUrl = pathToFileURL(join(projectRoot, 'node_modules/ink/build/measure-text.js')).href;
	const wrapUrl = pathToFileURL(join(projectRoot, 'node_modules/ink/build/wrap-text.js')).href;
	const childSource = `
import measureText from ${JSON.stringify(measureUrl)};
import wrapText from ${JSON.stringify(wrapUrl)};
global.gc();
const before = process.memoryUsage().heapUsed;
for (let i = 0; i < 20_000; i += 1) {
  const text = String(i) + ':' + 'text '.repeat(200);
  measureText(text);
  wrapText(text, 80, 'wrap');
}
global.gc();
console.log(JSON.stringify({retainedBytes: process.memoryUsage().heapUsed - before}));
`;
	const output = execFileSync(process.execPath, ['--max-old-space-size=128', '--expose-gc', '--input-type=module', '--eval', childSource], {
		cwd: projectRoot,
		encoding: 'utf8',
	});
	const {retainedBytes} = JSON.parse(output) as {retainedBytes: number};
	assert.ok(retainedBytes < 64 * 1024 * 1024, `retained ${(retainedBytes / 1024 / 1024).toFixed(1)} MiB after 20,000 unique texts`);
});
