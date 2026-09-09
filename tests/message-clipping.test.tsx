import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToString } from 'ink';
import { MessageRow } from '../src/ui/MessageRow.js';
import type { ChatMessage } from '../src/types.js';

for (const isMine of [false, true]) {
  test(`partial ${isMine ? 'outgoing' : 'incoming'} message keeps original line order`, () => {
    const msg: ChatMessage = {
      id: 123, contactId: 1, chatType: 'group', senderId: isMine ? 1 : 2,
      senderName: 'SENDER', timestamp: 0, isMine,
      content: 'FIRST-LINE-ABCDEFGHIJKLMNOPQRSTUVWXYZ second-line-abcdefghijklmnopqrstuvwxyz third-line-0123456789',
    };
    const props = {msg, index: 0, selfId: 1, activeSession: null, termWidth: 40,
      imagePreviewHeight: 10, imageMode: 'off' as const, renderInlineImage: false, messageGap: 0};
    const full = renderToString(<MessageRow {...props} />, {columns: 40}).split('\n');
    for (let start = 0; start < full.length; start++) {
      for (let count = 1; count <= full.length - start; count++) {
        const cropped = renderToString(<MessageRow {...props} cropTop={start} visibleRows={count} clipped />, {columns: 40});
        assert.equal(cropped, full.slice(start, start + count).join('\n'), `crop ${start}, ${count}`);
      }
    }
  });
}
