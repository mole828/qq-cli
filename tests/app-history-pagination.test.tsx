import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { PassThrough, Writable } from "node:stream";
import { render } from "ink";
import { App } from "../src/App.js";
import { QQClient } from "../src/qq-client.js";
import type { ChatMessage } from "../src/types.js";

function message(id: number, contactId: number, prefix: string): ChatMessage {
  return {
    id,
    contactId,
    chatType: "group",
    senderId: 2,
    senderName: "Sender",
    content: `${prefix}-${id}`,
    timestamp: id * 1_000,
    isMine: false,
  };
}

test("PageUp pages older history without overriding PageDown or a session switch", async (t) => {
  const pendingOlderPages: Array<(page: ChatMessage[] | null) => void> = [];
  t.mock.method(QQClient.prototype, "connect", function (this: QQClient) {
    const client = this as unknown as {
      onStatusCallback: ((connected: boolean) => void) | null;
    };
    client.onStatusCallback?.(true);
  });
  t.mock.method(QQClient.prototype, "disconnect", () => {});
  t.mock.method(QQClient.prototype, "getLoginInfo", async () => ({ user_id: 1, nickname: "Me" }));
  t.mock.method(QQClient.prototype, "getFriendList", async () => []);
  t.mock.method(QQClient.prototype, "getGroupList", async () => [
    { id: 1, name: "Group One", type: "group" as const },
    { id: 2, name: "Group Two", type: "group" as const },
  ]);
  t.mock.method(QQClient.prototype, "getGroupMemberList", async () => []);
  t.mock.method(QQClient.prototype, "getRecentContactActivity", async () => []);
  t.mock.method(QQClient.prototype, "getChatHistory", function (
    contact,
    _count,
    beforeMessageId
  ) {
    if (beforeMessageId !== undefined) {
      return new Promise<ChatMessage[] | null>((resolve) => pendingOlderPages.push(resolve));
    }
    return Promise.resolve(
      contact.id === 1
        ? Array.from({ length: 12 }, (_, index) => message(100 + index, 1, "G1"))
        : Array.from({ length: 6 }, (_, index) => message(200 + index, 2, "G2"))
    );
  });

  const stdin = new PassThrough() as PassThrough & { isTTY: boolean; setRawMode: () => void };
  Object.assign(stdin, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  let output = "";
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  Object.assign(stdout, { columns: 100, rows: 24 });
  const app = render(<App />, { stdin, stdout, stderr: stdout, debug: true, patchConsole: false, exitOnCtrlC: false });
  const pause = () => new Promise((resolve) => setTimeout(resolve, 80));
  async function key(value: string) {
    output = "";
    stdin.write(value);
    await pause();
  }

  try {
    await pause();
    await key("/session group:1");
    await key("\r");
    assert.match(output, /G1-111/);

    for (let i = 0; i < 8 && pendingOlderPages.length === 0; i++) {
      await key("\x1b[5~");
    }
    assert.equal(pendingOlderPages.length, 1, "PageUp at the transcript top requests an older page");

    // This explicit move towards recent messages must remain effective when
    // the outstanding older page resolves.
    await key("\x1b[6~");
    await key("\x1b[F");
    pendingOlderPages.shift()!(Array.from({ length: 12 }, (_, index) => message(88 + index, 1, "OLD")));
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.match(output, /G1-111/);
    assert.doesNotMatch(output, /OLD-90/);
    assert.equal(pendingOlderPages.length, 0, "loading a page does not automatically request another");

    for (let i = 0; i < 10 && pendingOlderPages.length === 0; i++) {
      await key("\x1b[5~");
    }
    assert.equal(pendingOlderPages.length, 1, "another PageUp cycle can request the next page");
    await key("/session group:2");
    await key("\r");
    assert.match(output, /G2-205/);

    pendingOlderPages.shift()!(Array.from({ length: 12 }, (_, index) => message(76 + index, 1, "LEAK")));
    await pause();
    assert.match(output, /G2-205/);
    assert.doesNotMatch(output, /LEAK-/);
    assert.doesNotMatch(output, /earlier messages loaded · Group One/);
  } finally {
    app.unmount();
    stdin.destroy();
  }
});
