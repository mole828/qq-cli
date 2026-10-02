import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { PassThrough, Writable } from "node:stream";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { render } from "ink";
import { App } from "../src/App.js";
import { QQClient } from "../src/qq-client.js";
import type { ChatMessage } from "../src/types.js";

function message(id: number, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id, contactId: 100, chatType: "group", senderId: 2,
    senderName: `Sender-${id}`, content: "hello", timestamp: id * 1_000, isMine: false, ...overrides };
}

test("reply mentions use cached or fetched senders, share modes, and do not return after reading", async (t) => {
  t.mock.method(QQClient.prototype, "connect", function (this: QQClient) {
    (this as unknown as { onStatusCallback: (connected: boolean) => void }).onStatusCallback(true);
  });
  t.mock.method(QQClient.prototype, "disconnect", () => {});
  t.mock.method(QQClient.prototype, "getSelfId", () => 1);
  t.mock.method(QQClient.prototype, "getLoginInfo", async () => ({ user_id: 1, nickname: "Me" }));
  t.mock.method(QQClient.prototype, "getFriendList", async () => []);
  t.mock.method(QQClient.prototype, "getGroupList", async () => [
    { id: 100, name: "Group One", type: "group" as const },
    { id: 200, name: "Group Two", type: "group" as const },
  ]);
  t.mock.method(QQClient.prototype, "getGroupMemberList", async () => []);
  t.mock.method(QQClient.prototype, "getRecentContactActivity", async () => []);
  t.mock.method(QQClient.prototype, "getChatHistory", async (contact) => contact.id === 100
    ? [message(10, { senderId: 1, isMine: true }), message(11)] : []);
  let emit!: (message: ChatMessage) => void;
  t.mock.method(QQClient.prototype, "onMessage", (callback) => { emit = callback; });
  const requests: string[] = [];
  const pending = new Map<string, (senderId: number | null) => void>();
  t.mock.method(QQClient.prototype, "getMessageSenderId", (id) => {
    requests.push(id);
    return new Promise<number | null>((resolve) => pending.set(id, resolve));
  });
  // Exercise the real cmux notification gate, replacing only its executable.
  const directory = await mkdtemp(join(tmpdir(), "qq-mention-"));
  const cliPath = join(directory, "cmux.cjs");
  const notificationsPath = join(directory, "notifications.jsonl");
  await writeFile(cliPath, `#!${process.execPath}
const fs = require("node:fs");
if (process.argv[2] === "notify") {
  fs.appendFileSync(process.env.QQ_CLI_TEST_NOTIFICATIONS, JSON.stringify(process.argv.slice(2)) + "\\n");
}
`);
  await chmod(cliPath, 0o755);
  const env = {
    QQ_CLI_CMUX: "on",
    QQ_CLI_CMUX_PATH: cliPath,
    QQ_CLI_CMUX_MENTION: "direct",
    QQ_CLI_TEST_NOTIFICATIONS: notificationsPath,
  };
  const previousEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  const notifications = () => existsSync(notificationsPath)
    ? readFileSync(notificationsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string[])
    : [];
  const stdin = new PassThrough();
  Object.assign(stdin, { isTTY: true, setRawMode() {}, ref() {}, unref() {} });
  let output = "";
  const stdout = new Writable({ write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } });
  Object.assign(stdout, { columns: 100, rows: 24 });
  const app = render(<App />, { stdin, stdout, stderr: stdout, debug: true, patchConsole: false, exitOnCtrlC: false });
  const pause = () => new Promise((resolve) => setTimeout(resolve, 80));
  async function waitNotifications(count: number) {
    const deadline = Date.now() + 2_000;
    while (notifications().length < count && Date.now() < deadline) await pause();
    assert.equal(notifications().length, count);
  }
  async function command(text: string) {
    stdin.write(text);
    await pause();
    output = "";
    stdin.write("\r");
    await pause();
  }
  async function receive(msg: ChatMessage) { output = ""; emit(msg); await pause(); }
  function resolve(id: string, senderId: number | null) { pending.get(id)!(senderId); pending.delete(id); }

  try {
    await pause();
    await command("/session group:100");
    await command("/session group:200");
    await receive(message(20, { segments: [{ type: "reply", data: { id: 10 } }] }));
    assert.match(output, /1 mention/);
    await waitNotifications(1);
    assert.ok(notifications()[0].includes("Sender-20 mentioned you"));
    assert.deepEqual(requests, [], "cached sender does not require get_msg");

    await receive(message(21, { content: "[CQ:reply,id=11]" }));
    assert.match(output, /1 mention/);
    assert.equal(notifications().length, 1, "replying to someone else does not notify");
    await receive(message(22, { senderId: 1, isMine: true, content: "[CQ:reply,id=10]" }));
    assert.equal(notifications().length, 1, "own replies do not notify");
    await receive(message(23, { content: "[CQ:reply,id=10][CQ:at,qq=1]" }));
    assert.match(output, /2 mentions/);
    await waitNotifications(2);

    await receive(message(24, { content: "[CQ:reply,id=999]" }));
    assert.deepEqual(requests, ["999"]);
    resolve("999", 1);
    await pause();
    assert.match(output, /3 mentions/);
    await waitNotifications(3);
    await receive(message(25, { content: "[CQ:reply,id=998]" }));
    resolve("998", null);
    await pause();
    assert.equal(notifications().length, 3, "failed lookups do not create a mention");

    await command("/mention off");
    await receive(message(26, { content: "[CQ:reply,id=10]" }));
    assert.doesNotMatch(output, /\d+ mentions?/);
    assert.equal(notifications().length, 3);
    await command("/mention direct");
    assert.match(output, /4 mentions/);
    assert.equal(notifications().length, 3, "changing modes does not re-notify");

    await command("/mention all");
    await receive(message(27, { content: "[CQ:reply,id=10][CQ:at,qq=all]" }));
    assert.match(output, /5 mentions/);
    await waitNotifications(4);
    await receive(message(30, { content: "[CQ:reply,id=995][CQ:at,qq=all]" }));
    assert.match(output, /6 mentions/, "at-all does not wait for a reply lookup");
    await waitNotifications(5);
    resolve("995", 1);
    await pause();
    assert.match(output, /6 mentions/);
    assert.equal(notifications().length, 5, "resolving the reply does not duplicate at-all notification");
    await command("/mention direct");
    assert.match(output, /6 mentions/, "a reply to self remains a direct mention even with at-all");

    await receive(message(28, { content: "[CQ:reply,id=997]" }));
    await command("/session group:100");
    assert.doesNotMatch(output, /\d+ mentions?/);
    await command("/session group:200");
    output = "";
    resolve("997", 1);
    await pause();
    assert.doesNotMatch(output, /\d+ mentions?/);
    assert.equal(notifications().length, 5, "a late lookup cannot restore a read mention");

    await receive(message(29, { content: "[CQ:reply,id=996]" }));
    app.unmount();
    resolve("996", 1);
    await pause();
    assert.equal(notifications().length, 5, "a late lookup after unmount cannot notify");
  } finally {
    app.unmount();
    stdin.destroy();
    await pause();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
