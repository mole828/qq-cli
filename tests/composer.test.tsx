import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { useState } from 'react';
import { PassThrough, Writable } from 'node:stream';
import { render, renderToString } from 'ink';
import { isComposerNewline } from '../src/composer-key.js';
import { getComposerInputLayout } from '../src/composer-layout.js';
import { composerText, type ComposerPart } from '../src/composer-draft.js';
import { PasteAwareTextInput } from '../src/ui/PasteAwareTextInput.js';

const parts = (text: string): ComposerPart[] => [{type: 'text', text}];
test('Shift+Enter recognises xterm and CSI-u without confusing Enter or pasted text', () => {
  const key = {return: false, shift: false};
  for (const input of ['\x1b[27;2;13~', '[27;2;13~', '[13;2u']) assert.equal(isComposerNewline(input, key), true);
  assert.equal(isComposerNewline('', {return: true, shift: true}), true);
  assert.equal(isComposerNewline('', {return: true, shift: false}), false);
  assert.equal(isComposerNewline('text [27;2;13~', key), false);
});
test('layout wraps wide text and follows the cursor across explicit lines', () => {
  const wrapped = getComposerInputLayout(parts('中文中文'), 4, 4);
  assert.equal(wrapped.cursorRow, 2);
  assert.equal(wrapped.rows[2][0].index, 4);
  assert.equal(getComposerInputLayout(parts('abcdx'), 4, 4).cursorRow, 1);
  assert.equal(getComposerInputLayout(parts('a\nb'), 1, 4).rows[0][1].label, ' ');
  assert.equal(wrapped.height, 3); // two full rows plus the trailing cursor
  const text = 'a\nb\nc\nd\ne\nf\ng';
  const tail = getComposerInputLayout(parts(text), text.length, 20);
  assert.equal(tail.height, 5);
  assert.equal(tail.startRow, 2);
  assert.equal(tail.cursorRow, 6);
  assert.equal(getComposerInputLayout(parts(text), 0, 20).startRow, 0);
});
test('multiline rendering keeps the tail visible', () => {
  const text = 'a\nb\nc\nd\ne\nf\nTAIL';
  const output = renderToString(<PasteAwareTextInput parts={parts(text)} cursorOffset={text.length} width={20} onChange={() => {}} onCursorChange={() => {}} />, {columns: 20});
  assert.match(output, /TAIL/);
  assert.equal(output.split('\n').length, 5);
});
test('raw terminal Shift+Enter inserts newline and Enter sends the multiline draft', async () => {
  const stdin = new PassThrough() as PassThrough & {isTTY: boolean; setRawMode: () => void};
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  Object.assign(stdin, {ref() {}, unref() {}});
  const stdout = new Writable({write(_chunk, _encoding, callback) {callback();}});
  let draft = '';
  const sent: string[] = [];
  function Harness() {
    const [value, setValue] = useState(parts(''));
    const [cursor, setCursor] = useState(0);
    draft = composerText(value);
    return <PasteAwareTextInput parts={value} cursorOffset={cursor} width={20} onChange={(next, offset) => {setValue(next); setCursor(offset);}} onCursorChange={setCursor} onSubmit={() => sent.push(composerText(value))} />;
  }
  const app = render(<Harness />, {stdin, stdout, stderr: stdout, debug: true, patchConsole: false, exitOnCtrlC: false});
  const pause = () => new Promise(resolve => setTimeout(resolve, 40));
  try {
    await pause();
    for (const key of ['hello', '\x1b[27;2;13~', 'world']) {stdin.write(key); await pause();}
    assert.equal(draft, 'hello\nworld');
    assert.deepEqual(sent, []);
    stdin.write('\r'); await pause();
    assert.deepEqual(sent, ['hello\nworld']);
    stdin.write('\x1b[13;2u'); await pause();
    assert.equal(draft, 'hello\nworld\n');
    stdin.write('\x1b[200~pasted\nlines\x1b[201~'); await pause();
    assert.equal(draft, 'hello\nworld\npasted\nlines');
    assert.equal(sent.length, 1);
    stdin.write('\x1b[A'); await pause();
    stdin.write('!'); await pause();
    assert.equal(draft, 'hello\nworld\npaste!d\nlines');
  } finally {app.unmount(); stdin.destroy();}
});
