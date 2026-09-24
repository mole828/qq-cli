import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToString } from 'ink';
import { ForwardPanel, getForwardPanelMaxOffset, getForwardPanelScrollOffset } from '../src/ui/ForwardPanel.js';
import type { ForwardNode } from '../src/types.js';

const nodes: ForwardNode[] = Array.from({length: 8}, (_, index) => ({
  senderName: 'Sender',
  segments: [{type: 'text', data: {text: `RECORD-${index}`}}],
}));
const props = {
  forwardId: 'record', nodes, loading: false, selectedNodeIndex: null,
  depth: 1, bodyRows: 9, termWidth: 120, cellWidth: 8, cellHeight: 16,
  imageMode: 'off' as const,
};
const render = (scrollOffset: number) => renderToString(
  <ForwardPanel {...props} scrollOffset={scrollOffset} />, {columns: 120}
);

test('forward opens at the beginning and scrolls towards the end', () => {
  const first = render(0);
  assert.match(first, /RECORD-0/);
  assert.doesNotMatch(first, /RECORD-7/);
  const next = render(2);
  assert.doesNotMatch(next, /RECORD-0/);
  assert.match(next, /RECORD-1/);
  const max = getForwardPanelMaxOffset('record', nodes, 9, 120, 8, 16, 'off');
  assert.match(render(max), /RECORD-7/);
  assert.equal(render(max + 100), render(max));
});

test('nested selection reveals its node using offsets from the top', () => {
  const last = getForwardPanelScrollOffset('record', nodes, 7, 9, 120, 8, 16, 'off', 0);
  assert.match(render(last), /RECORD-7/);
  const first = getForwardPanelScrollOffset('record', nodes, 0, 9, 120, 8, 16, 'off', last);
  assert.equal(first, 0);
  assert.match(render(first), /RECORD-0/);
});
