import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { render, renderToString } from 'ink';
import { App } from '../src/App.js';
import { QQClient } from '../src/qq-client.js';
import { CompletionPanel } from '../src/ui/CompletionPanel.js';
import { textWidth } from '../src/terminal-text.js';

test('completion panel keeps five rows and clips multiline, wide previews', () => {
  const output = renderToString(<CompletionPanel items={Array.from({length: 12}, (_, index) => ({value: String(index), label: `#${index} 中文作者\n${'长消息'.repeat(30)}`}))} highlight={10} width={30} />, {columns: 32});
  assert.equal(output.split('\n').length, 5);
  assert.match(output, /#10/);
  assert.match(output, /11\/12/);
  for (const line of output.split('\n')) assert.ok(textWidth(line) <= 32);
});

test('App completion accepts without executing, dismisses without clearing, and navigates candidates', async (t) => {
  t.mock.method(QQClient.prototype, 'connect', () => {});
  t.mock.method(QQClient.prototype, 'disconnect', () => {});
  const stdin = new PassThrough() as PassThrough & {isTTY: boolean; setRawMode: () => void};
  Object.assign(stdin, {isTTY: true, setRawMode() {}, ref() {}, unref() {}});
  let output = '';
  const stdout = new Writable({write(chunk, _encoding, callback) {output += chunk.toString(); callback();}});
  Object.assign(stdout, {columns: 80, rows: 24});
  const directory = await mkdtemp(join(tmpdir(), 'qq-completion-'));
  await mkdir(join(directory, 'audio folder'));
  await writeFile(join(directory, 'audio folder', 'sample.wav'), '');
  const app = render(<App />, {stdin, stdout, stderr: stdout, debug: true, patchConsole: false, exitOnCtrlC: false});
  const pause = () => new Promise(resolve => setTimeout(resolve, 70));
  async function key(value: string) {output = ''; stdin.write(value); await pause();}
  try {
    await pause();
    await key('/re');
    assert.match(output, /1\/3/);
    await key('\x1b[B');
    assert.match(output, /2\/3/);
    await key('\t');
    assert.match(output, /\/reply/);
    assert.doesNotMatch(output, /1\/3/);
    await key('\x1b'); // clear the accepted draft
    await key('/he');
    assert.match(output, /Tab\/Enter accept/);
    await key('\x1b'); // dismiss without changing draft
    assert.match(output, /\/he/);
    assert.doesNotMatch(output, /Tab\/Enter accept/);
    await key('\t');
    assert.match(output, /Tab\/Enter accept/);
    await key('\r');
    assert.match(output, /\/help/);
    assert.doesNotMatch(output, /~\/help/);
    await key('\r');
    assert.match(output, /~\/help/);
    await key('\x1b');
    for (const command of ['/g', '/groups', '/f', '/c', '/s']) {
      await key(command);
      await key('\r');
      assert.match(output, /Filter sessions, then Enter/);
      await key('\x1b');
    }
    await key('/help');
    assert.match(output, /Enter run/);
    await key('\r');
    assert.match(output, /~\/help/);
    await key('\x1b');
    await key(`/audio "${directory}/"`);
    assert.match(output, /audio folder/);
    await key('\t');
    assert.match(output, /sample.wav/);
    await key('\t');
    assert.match(output, /sample.wav/);
    assert.doesNotMatch(output, /Tab\/Enter accept/);
    // Further edits filter candidates again instead of retaining the accepted file.
    await key('x');
    assert.doesNotMatch(output, /Tab\/Enter accept/);
  } finally {app.unmount(); stdin.destroy(); await rm(directory, {recursive: true, force: true});}
});
