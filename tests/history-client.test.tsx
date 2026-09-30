import assert from "node:assert/strict";
import { test } from "node:test";
import { QQClient } from "../src/qq-client.js";
import type { Contact, OneBotApiResponse } from "../src/types.js";

// Replace the transport only: exercise history request construction and decoding.
function mockHistory(response: OneBotApiResponse) {
  const client = new QQClient("ws://localhost:3001");
  const requests: { action: string; params: Record<string, unknown> }[] = [];
  Object.assign(client, {
    callApi: async (action: string, params: Record<string, unknown>) => {
      requests.push({ action, params });
      return response;
    },
  });
  return { client, requests };
}

for (const type of ["group", "friend"] as const) {
  test(`${type} history uses the returned message ID to fetch older pages`, async () => {
    const { client, requests } = mockHistory({ status: "ok", retcode: 0, data: { messages: [] } });
    const contact: Contact = { type, id: 123, name: "session" };
    await client.getChatHistory(contact);
    await client.getChatHistory(contact, 20, "9007199254740993");
    const target = type === "group" ? "group_id" : "user_id";
    const action = type === "group" ? "get_group_msg_history" : "get_friend_msg_history";
    assert.deepEqual(requests[0], {
      action,
      params: { [target]: "123", count: 20, reverseOrder: false, ...(type === "friend" ? { message_seq: "0" } : {}) },
    });
    assert.deepEqual(requests[1], {
      action,
      params: { [target]: "123", count: 20, reverseOrder: true, message_seq: "9007199254740993" },
    });
  });
}

test("history sorts reversed pages chronologically and preserves same-second IDs", async () => {
  const { client } = mockHistory({ status: "ok", retcode: 0, data: { messages: [
    { message_id: "anchor", user_id: 1, time: 12, raw_message: "anchor" },
    { message_id: "older-a", user_id: 1, time: 11, raw_message: "a" },
    { message_id: "older-b", user_id: 1, time: 11, raw_message: "b" },
    null,
  ] } });
  const result = await client.getChatHistory({ id: 123, name: "session", type: "group" }, 20, "anchor");
  assert.deepEqual(result?.map(message => message.id), ["older-a", "older-b", "anchor"]);
});

test("unavailable history is distinguished from an empty page", async () => {
  const contact: Contact = { id: 123, name: "session", type: "group" };
  const failed = mockHistory({ status: "failed", retcode: -1, data: null });
  const empty = mockHistory({ status: "ok", retcode: 0, data: { messages: [] } });
  assert.equal(await failed.client.getChatHistory(contact), null);
  assert.deepEqual(await empty.client.getChatHistory(contact), []);
});
