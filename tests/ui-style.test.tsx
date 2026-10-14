import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'ink';
import { parseUiStyle } from '../src/config.js';
import { resolveUiStyle } from '../src/ui/theme.js';
import { readUiStyleConfig, writeUiStyleConfig } from '../src/ui-config.js';
import { MessageRow as ClassicMessageRow } from '../src/ui/classic/MessageRow.js';
import { MessageRow as QoderMessageRow } from '../src/ui/qoder/MessageRow.js';
import { Composer as QoderComposer } from '../src/ui/qoder/Composer.js';
import { textWidth } from '../src/terminal-text.js';
import type { ChatMessage } from '../src/types.js';

const mine: ChatMessage = {
  id: '1',
  contactId: 42,
  chatType: 'private',
  senderId: 7,
  senderName: 'me',
  content: 'hello world',
  timestamp: 1_700_000_000_000,
  isMine: true,
  segments: [{ type: 'text', data: { text: 'hello world' } }],
};

const rowProps = {
  msg: mine,
  index: 0,
  selfId: 7,
  activeSession: null,
  termWidth: 60,
  imagePreviewHeight: 0,
  imageMode: 'off' as const,
  renderInlineImage: false,
  messageGap: 0,
};

test('parseUiStyle accepts only known styles', () => {
  assert.equal(parseUiStyle(' classic '), 'classic');
  assert.equal(parseUiStyle('QODER'), 'qoder');
  assert.equal(parseUiStyle('gruvbox'), null);
  assert.equal(parseUiStyle(undefined), null);
});

test('resolveUiStyle prefers flag, then env, then persisted, then classic', () => {
  assert.equal(resolveUiStyle('qoder', 'classic', 'classic'), 'qoder');
  assert.equal(resolveUiStyle(undefined, 'qoder', 'classic'), 'qoder');
  assert.equal(resolveUiStyle(undefined, undefined, 'qoder'), 'qoder');
  assert.equal(resolveUiStyle(undefined, undefined, undefined), 'classic');
  assert.equal(resolveUiStyle('nope', 'nope', 'qoder'), 'qoder');
});

test('ui config round-trips the style and preserves unrelated keys', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-cli-config-'));
  process.env.QQ_CLI_CONFIG_DIR = dir;
  try {
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ theme: 'x' }), 'utf8');
    assert.equal(readUiStyleConfig(), undefined);
    writeUiStyleConfig('qoder');
    assert.equal(readUiStyleConfig(), 'qoder');
    const saved = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    assert.deepEqual(saved, { theme: 'x', ui: 'qoder' });
  } finally {
    delete process.env.QQ_CLI_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt ui config falls back to no persisted style', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qq-cli-config-'));
  process.env.QQ_CLI_CONFIG_DIR = dir;
  try {
    writeFileSync(join(dir, 'config.json'), '{not json', 'utf8');
    assert.equal(readUiStyleConfig(), undefined);
  } finally {
    delete process.env.QQ_CLI_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('classic message row keeps the chevron prompt', () => {
  const output = renderToString(<ClassicMessageRow {...rowProps} />);
  assert.match(output, /›/);
});

test('qoder message row uses the plain greater-than prompt', () => {
  const output = renderToString(<QoderMessageRow {...rowProps} />);
  assert.match(output, />/);
  assert.ok(!output.includes('›'));
});

const composerProps = {
  parts: [], cursorOffset: 0,
  onChange() {}, onCursorChange() {}, onSubmit() {}, onPaste() { return false; },
  helpMode: false, modalMode: false, forwardMode: false,
  activeSession: { id: 42, type: 'group' as const, name: '开发讨论' },
  statusMsg: '', replyTarget: null, connected: true,
  unreadTotal: 123, mentionTotal: 45, imageMode: 'off' as const,
};

test('qoder composer frames the input without changing its row budget', () => {
  const output = renderToString(<QoderComposer {...composerProps} termWidth={80} />, { columns: 80 });
  const rows = output.split('\n');
  assert.equal(rows.length, 5);
  assert.match(rows[0], /shortcuts/);
  assert.match(rows[1], /─/);
  assert.match(rows[2], />/);
  assert.match(rows[3], /─/);
  assert.match(rows[4], /qq-cli/);
});

test('qoder composer preserves send failures and fits narrow terminals', () => {
  for (const width of [40, 60, 80]) {
    const output = renderToString(
      <QoderComposer {...composerProps} termWidth={width} statusMsg="Send failed: connection closed" />,
      { columns: width }
    );
    assert.match(output, /Send failed/);
    assert.equal(output.split('\n').length, 5);
    for (const row of output.split('\n')) assert.ok(textWidth(row) <= width, `overflow at ${width}: ${row}`);
  }
});

test('qoder composer keeps reply details with large counters', () => {
  const output = renderToString(
    <QoderComposer {...composerProps} termWidth={60}
      replyTarget={{ messageId: '12345', senderName: 'someone', preview: 'message', sessionKey: 'group:42' }} />,
    { columns: 60 }
  );
  assert.match(output, /↳ #12345/);
  assert.match(output, /\[reply\]/);
});
