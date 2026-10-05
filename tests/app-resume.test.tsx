import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { PassThrough, Writable } from "node:stream";
import { render } from "ink";
import { App } from "../src/App.js";
import { RestartOnResume } from "../src/RestartOnResume.js";
import { QQClient } from "../src/qq-client.js";
import { RESUME_GAP_MS } from "../src/resume.js";
import type { ChatMessage, Contact } from "../src/types.js";

test("resume reopens the active session at the latest messages and handles unavailable sessions", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 100_000 });
  let accountId = 1;
  let connections = 0;
  let disconnections = 0;
  let groups: Contact[] = [{ id: 100, name: "Original Group", type: "group" }];
  const historyRequests: string[] = [];
  t.mock.method(QQClient.prototype, "connect", function (this: QQClient) {
    connections += 1;
    (this as unknown as { onStatusCallback: (connected: boolean) => void }).onStatusCallback(true);
  });
  t.mock.method(QQClient.prototype, "disconnect", () => { disconnections += 1; });
  t.mock.method(QQClient.prototype, "getSelfId", () => accountId);
  t.mock.method(QQClient.prototype, "getLoginInfo", async () => ({ user_id: accountId, nickname: "Me" }));
  // Same ID in both lists ensures restoration matches the session type too.
  t.mock.method(QQClient.prototype, "getFriendList", async () => [
    { id: 100, name: "Other Friend", type: "friend" as const },
  ]);
  t.mock.method(QQClient.prototype, "getGroupList", async () => groups);
  t.mock.method(QQClient.prototype, "getGroupMemberList", async () => []);
  t.mock.method(QQClient.prototype, "getRecentContactActivity", async () => []);
  t.mock.method(QQClient.prototype, "getChatHistory", async (contact) => {
    historyRequests.push(`${contact.type}:${contact.id}`);
    return Array.from({ length: 40 }, (_, index): ChatMessage => ({
      id: connections * 100 + index,
      contactId: contact.id,
      chatType: contact.type === "group" ? "group" : "private",
      senderId: 2,
      senderName: "Sender",
      content: `generation-${connections}-entry-${index}`,
      timestamp: index * 1_000,
      isMine: false,
    }));
  });

  const stdin = new PassThrough();
  Object.assign(stdin, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  let output = "";
  const stdout = new Writable({
    write(chunk, _encoding, callback) { output += chunk.toString(); callback(); },
  });
  Object.assign(stdout, { columns: 100, rows: 24 });
  const app = render(
    <RestartOnResume>
      {(resumeSession, onSessionChange) => <App resumeSession={resumeSession} onSessionChange={onSessionChange} />}
    </RestartOnResume>,
    { stdin, stdout, stderr: stdout, debug: true, patchConsole: false, exitOnCtrlC: false }
  );
  const pause = () => new Promise((resolve) => setTimeout(resolve, 80));
  async function key(value: string) {
    output = "";
    stdin.write(value);
    await pause();
  }
  async function resume() {
    output = "";
    t.mock.timers.setTime(Date.now() + RESUME_GAP_MS);
    t.mock.timers.tick(1_000);
    await pause();
  }

  try {
    await pause();
    await resume();
    assert.equal(connections, 2);
    assert.deepEqual(historyRequests, [], "no selected session stays on the initial screen");

    await key("/session group:100");
    await key("\r");
    assert.match(output, /generation-2-entry-39/);
    await key("\x1b[5~");
    await key("unsent-draft");
    groups = [{ id: 100, name: "Renamed Group", type: "group" }];
    await resume();
    assert.equal(disconnections, 2, "resume recreates the connection");
    assert.match(output, /Renamed Group/);
    assert.match(output, /generation-3-entry-39/, "restored transcript shows the latest position");
    assert.doesNotMatch(output, /unsent-draft|Original Group|Other Friend|generation-2-entry-/);

    await resume();
    assert.match(output, /generation-4-entry-39/, "a second suspension restores the same session again");
    assert.deepEqual(historyRequests, ["group:100", "group:100", "group:100"]);

    accountId = 2;
    await resume();
    assert.match(output, /Use \/session to select a session/);
    assert.equal(historyRequests.length, 3, "a different account does not restore the previous session");

    await key("/session group:100");
    await key("\r");
    assert.match(output, /generation-5-entry-39/);
    groups = [];
    await resume();
    assert.match(output, /Use \/session to select a session/);
    assert.equal(historyRequests.length, 4, "a missing group does not restore the friend with the same ID");
  } finally {
    app.unmount();
    stdin.destroy();
  }
});
