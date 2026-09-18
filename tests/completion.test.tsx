import assert from "node:assert/strict";
import { test } from "node:test";
import { getCommandCompletions } from "../src/completion.js";
import type { ChatMessage, Contact } from "../src/types.js";

const friend: Contact = { id: 100, name: "Alice", type: "friend" };
const group: Contact = { id: 200, name: "Alice Group", type: "group" };
const otherGroup: Contact = { id: 300, name: "Other Group", type: "group" };

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 1,
    contactId: group.id,
    chatType: "group",
    senderId: 8,
    senderName: "Bob",
    content: "hello",
    timestamp: 1,
    isMine: false,
    ...overrides,
  };
}

test("command completion filters names and adds argument spacing selectively", () => {
  assert.deepEqual(
    getCommandCompletions("/re", [], [], null).map((item) => item.value),
    ["/record ", "/reply ", "/reload"]
  );
  assert.deepEqual(
    getCommandCompletions("/he", [], [], null),
    [{ value: "/help", label: "/help", description: "查看命令和快捷键" }]
  );
});

test("reply candidates are scoped, exclude own messages, deduplicate IDs, and preview content", () => {
  const messages = [
    message({ id: 3, timestamp: 3, content: "newest" }),
    message({ id: 3, timestamp: 2, content: "duplicate" }),
    message({ id: 2, timestamp: 4, isMine: true, content: "mine" }),
    message({ id: 4, contactId: otherGroup.id, content: "other session" }),
  ];

  const items = getCommandCompletions("/reply ", [group, otherGroup], messages, group);
  assert.deepEqual(items.map((item) => item.value), ["/reply 3"]);
  assert.match(items[0].label, /Bob/);
  assert.match(items[0].label, /newest/);
});

test("forward candidates include only messages containing a forward segment", () => {
  const items = getCommandCompletions("/forward 1", [], [
    message({ id: 10, segments: [{ type: "forward", data: { id: "123" } }] }),
    message({ id: 11, segments: [{ type: "text", data: { text: "plain" } }] }),
  ], group);

  assert.deepEqual(items.map((item) => item.value), ["/forward 10"]);
  assert.deepEqual(
    getCommandCompletions("/forward ", [], [
      message({ id: 10, segments: [{ type: "forward", data: { id: "123" } }] }),
      message({ id: 11, segments: [{ type: "text", data: { text: "plain" } }] }),
    ], group).map((item) => item.value),
    ["/forward 10"]
  );
});

test("session candidates search by name or ID and insert a typed canonical target", () => {
  assert.deepEqual(
    getCommandCompletions("/session alice", [friend, group], [], null).map((item) => item.value),
    ["/session friend:100", "/session group:200"]
  );
  assert.deepEqual(
    getCommandCompletions("/s 300", [friend, group, otherGroup], [], null).map((item) => item.value),
    ["/session group:300"]
  );
});
