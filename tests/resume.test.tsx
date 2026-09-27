import assert from "node:assert/strict";
import { test } from "node:test";
import { RESUME_GAP_MS, watchForResume } from "../src/resume.js";

test("regular checks do not restart an idle application", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 100_000 });
  const gaps: number[] = [];
  const stop = watchForResume((gap) => gaps.push(gap));
  for (let i = 0; i < 120; i++) t.mock.timers.tick(1_000);
  assert.deepEqual(gaps, []);
  stop();
});

test("resume restarts once per suspension and stopping removes the watcher", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 100_000 });
  const gaps: number[] = [];
  const stop = watchForResume((gap) => gaps.push(gap));
  t.mock.timers.setTime(Date.now() + RESUME_GAP_MS - 1_000);
  t.mock.timers.tick(1_000);
  assert.deepEqual(gaps, [RESUME_GAP_MS]);
  t.mock.timers.tick(1_000);
  assert.equal(gaps.length, 1);
  t.mock.timers.setTime(Date.now() + 60_000);
  t.mock.timers.tick(1_000);
  assert.deepEqual(gaps, [RESUME_GAP_MS, 61_000]);
  stop();
  t.mock.timers.setTime(Date.now() + 60_000);
  t.mock.timers.tick(1_000);
  assert.equal(gaps.length, 2);
});

test("short pauses and backward clock changes do not restart", (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 100_000 });
  const gaps: number[] = [];
  const stop = watchForResume((gap) => gaps.push(gap));
  t.mock.timers.setTime(Date.now() + RESUME_GAP_MS - 1_001);
  t.mock.timers.tick(1_000);
  t.mock.timers.setTime(Date.now() - 60_000);
  t.mock.timers.tick(1_000);
  t.mock.timers.tick(1_000);
  assert.deepEqual(gaps, []);
  stop();
});
