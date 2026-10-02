import assert from "node:assert/strict";
import { test } from "node:test";
import { getReplyMessageId, messageMentionsUser } from "../src/message-format.js";
import { QQClient } from "../src/qq-client.js";
import type { ChatMessage, OneBotApiResponse } from "../src/types.js";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: 10, contactId: 100, chatType: "group", senderId: 2,
    senderName: "Sender", content: "hello", timestamp: 0, isMine: false, ...overrides };
}

test("reply IDs accept array segments, raw CQ and CQ inside text segments", () => {
  assert.equal(getReplyMessageId(message({ segments: [{ type: "reply", data: { id: -123 } }] })), "-123");
  assert.equal(getReplyMessageId(message({ content: "[CQ:reply,id=9007199254740993]hi" })), "9007199254740993");
  assert.equal(getReplyMessageId(message({ segments: [{ type: "text", data: { text: "[CQ:reply,id=42]hi" } }] })), "42");
  assert.equal(getReplyMessageId(message({ segments: [{ type: "reply", data: { id: " " } }] })), null);
  assert.equal(getReplyMessageId(message({ content: "&#91;CQ:reply,id=42&#93;" })), null);
});

test("resolved replies to self share mention detection while others and unknown targets do not", () => {
  assert.equal(messageMentionsUser(message({ replySenderId: 1 }), 1), true);
  assert.equal(messageMentionsUser(message({ replySenderId: 2 }), 1), false);
  assert.equal(messageMentionsUser(message({ content: "[CQ:reply,id=42]" }), 1), false);
  assert.equal(messageMentionsUser(message({ replySenderId: 0 }), 0), false);
  assert.equal(messageMentionsUser(message({ content: "[CQ:at,qq=1]" }), 1), true);
  const all = message({ segments: [{ type: "at", data: { qq: "all" } }] });
  assert.equal(messageMentionsUser(all, 1), false);
  assert.equal(messageMentionsUser(all, 1, { includeAll: true }), true);
  assert.equal(messageMentionsUser({ ...all, replySenderId: 1 }, 1), true);
});

test("get_msg resolves reply sender IDs and preserves large message IDs", async () => {
  const client = new QQClient("ws://localhost:3001");
  const requests: unknown[] = [];
  let response: OneBotApiResponse = { status: "ok", retcode: 0, data: { sender: { user_id: "1" } } };
  Object.assign(client, { callApi: async (action: string, params: unknown) => {
    requests.push({ action, params });
    return response;
  } });
  assert.equal(await client.getMessageSenderId("-123"), 1);
  assert.equal(await client.getMessageSenderId("9007199254740993"), 1);
  assert.deepEqual(requests, [
    { action: "get_msg", params: { message_id: -123 } },
    { action: "get_msg", params: { message_id: "9007199254740993" } },
  ]);
  response = { status: "failed", retcode: -1, data: { sender: { user_id: 1 } } };
  assert.equal(await client.getMessageSenderId("42"), null);
  for (const data of [null, {}, { sender: { user_id: "invalid" } }, { sender: { user_id: 0 } }]) {
    response = { status: "ok", retcode: 0, data };
    assert.equal(await client.getMessageSenderId("42"), null);
  }
});
