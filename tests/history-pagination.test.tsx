import assert from "node:assert/strict";
import { test } from "node:test";
import {
  earliestHistoryMessage,
  HistoryPagination,
  mergeHistoryMessages,
  shouldAdvanceHistoryViewport,
} from "../src/history-pagination.js";
import type { ChatMessage } from "../src/types.js";

function message(
  id: number | string,
  timestamp: number,
  contactId = 1
): ChatMessage {
  return {
    id,
    contactId,
    chatType: "group",
    senderId: 8,
    senderName: "sender",
    content: `message ${id}`,
    timestamp,
    isMine: false,
  };
}

test("initial and older history requests lock per session and failures can be retried", () => {
  const pagination = new HistoryPagination();
  const initial = pagination.beginInitial("group:1");
  assert.ok(initial);
  assert.equal(pagination.beginInitial("group:1"), null);
  assert.deepEqual(pagination.snapshot("group:1"), {
    initialLoaded: false,
    hasMore: false,
    loading: true,
  });

  assert.deepEqual(pagination.complete(initial, null), {
    kind: "initial",
    failed: true,
    hasMore: false,
  });
  assert.equal(pagination.snapshot("group:1").loading, false);
  const retry = pagination.beginInitial("group:1");
  assert.ok(retry);
  assert.notEqual(retry.requestId, initial.requestId);
  pagination.complete(retry, 2, 2);

  const older = pagination.beginOlder("group:1", "first-id");
  assert.ok(older);
  assert.deepEqual(pagination.complete(older, null), {
    kind: "older",
    failed: true,
    hasMore: true,
  });
  assert.ok(pagination.beginOlder("group:1", "first-id"));
});

test("overlapping pages deduplicate anchor IDs and preserve distinct same-second messages", () => {
  const existing = [message(200, 10), message(202, 10), message(300, 11)];
  const page = [
    message(199, 9),
    message(201, 10),
    { ...message(200, 10), content: "stale duplicate" },
    message(201, 10),
  ];
  const merged = mergeHistoryMessages(existing, page);

  assert.deepEqual(merged.added.map((item) => item.id), [199, 201]);
  assert.deepEqual(merged.messages.map((item) => item.id), [199, 201, 200, 202, 300]);
  assert.equal(merged.messages.find((item) => item.id === 200)?.content, "message 200");
  assert.equal(earliestHistoryMessage(merged.messages)?.id, 199);
});

test("a repeated page with no new IDs ends paging instead of looping", () => {
  const pagination = new HistoryPagination();
  const initial = pagination.beginInitial("group:1")!;
  pagination.complete(initial, 20);

  const firstOlder = pagination.beginOlder("group:1", 100)!;
  assert.equal(pagination.beginOlder("group:1", 100), null);
  assert.deepEqual(pagination.complete(firstOlder, 20, 19), {
    kind: "older",
    failed: false,
    hasMore: true,
  });

  const repeated = pagination.beginOlder("group:1", 81)!;
  assert.deepEqual(pagination.complete(repeated, 20, 0), {
    kind: "older",
    failed: false,
    hasMore: false,
  });
  assert.equal(pagination.beginOlder("group:1", 81), null);
});

test("viewport auto-advance is cancelled by PageDown, End, or sending while loading", () => {
  assert.equal(shouldAdvanceHistoryViewport(4, 4), true);
  assert.equal(shouldAdvanceHistoryViewport(4, 5), false);
});

test("resetting one session does not disturb another session request", () => {
  const pagination = new HistoryPagination();
  const first = pagination.beginInitial("group:1")!;
  const second = pagination.beginInitial("group:2")!;
  pagination.reset("group:1");

  assert.equal(pagination.isCurrent(first), false);
  assert.equal(pagination.isCurrent(second), true);
  assert.deepEqual(pagination.complete(second, 1), {
    kind: "initial",
    failed: false,
    hasMore: true,
  });
});
