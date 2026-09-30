import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MESSAGES_PER_SESSION, retainSessionMessages } from "../src/message-retention.js";
import type { ChatMessage } from "../src/types.js";

function message(id: number, contactId = 1, chatType: ChatMessage["chatType"] = "group"): ChatMessage {
  return { id, contactId, chatType, senderId: 8, senderName: "sender", content: "text", timestamp: id, isMine: false };
}

test("busy groups evict only their own messages, preserving transcript order and private sessions with the same ID", () => {
  const input = [message(1, 2), message(2), message(3, 1, "private"), message(4), message(5)];
  const result = retainSessionMessages(input, 2);
  assert.deepEqual(result.messages.map(m => m.id), [1, 3, 4, 5]);
  assert.deepEqual(result.removed, [input[1]]);
  assert.equal(input.length, 5);
});

test("merged old history cannot displace recent messages and outgoing entries count toward the limit", () => {
  const input = [message(1), message(2), message(3), { ...message(4), isMine: true }];
  const result = retainSessionMessages(input, 2);
  assert.deepEqual(result.messages.map(m => m.id), [3, 4]);
  assert.equal(result.removed.length, 2);
});

test("default limit is enforced independently for multiple busy groups", () => {
  const input = Array.from({ length: MAX_MESSAGES_PER_SESSION + 20 }, (_, i) =>
    [message(i, 1), message(i, 2)]).flat();
  const result = retainSessionMessages(input);
  assert.equal(result.messages.length, MAX_MESSAGES_PER_SESSION * 2);
  assert.equal(result.removed.length, 40);
  assert.equal(result.messages[0]!.id, 20);
});

test("a session being actively paged keeps older pages while other sessions stay capped", () => {
  const input = Array.from({ length: MAX_MESSAGES_PER_SESSION + 20 }, (_, i) =>
    [message(i, 1), message(i, 2)]).flat();
  const result = retainSessionMessages(input, MAX_MESSAGES_PER_SESSION, new Set(["group:1"]));

  assert.equal(result.messages.filter((m) => m.contactId === 1).length, MAX_MESSAGES_PER_SESSION + 20);
  assert.equal(result.messages.filter((m) => m.contactId === 2).length, MAX_MESSAGES_PER_SESSION);
  assert.equal(result.messages.find((m) => m.contactId === 1)?.id, 0);
  assert.equal(result.messages.find((m) => m.contactId === 2)?.id, 20);
  assert.equal(result.removed.length, 20);
});

test("sessions below the limit keep their existing array and message references", () => {
  const input = [message(1), message(2, 2)];
  const result = retainSessionMessages(input, 1);
  assert.equal(result.messages, input);
  assert.deepEqual(result.removed, []);
});
