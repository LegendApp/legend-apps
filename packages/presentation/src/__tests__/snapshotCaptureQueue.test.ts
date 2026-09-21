import assert from "node:assert/strict";
import { test } from "node:test";
import { createSnapshotCaptureQueue } from "../snapshotCaptureQueue.ts";

function harness() {
  let id = 0;
  const frames = new Map<number, () => void>();
  const queue = createSnapshotCaptureQueue(fn => { frames.set(++id, fn); return id; }, key => { frames.delete(key); });
  const frame = async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); };
  return { queue, frame, frames };
}
test("a burst of mounted carousel cards produces only one readback at a time", async () => {
  const h = harness();
  let running = 0, max = 0, completed = 0;
  for (let i = 0; i < 9; i++) h.queue.enqueue(async () => {
    running++; max = Math.max(max, running); await Promise.resolve(); running--; completed++;
  });
  await h.frame(); assert.equal(completed, 0);
  await h.frame(); assert.equal(completed, 1);
  for (let i = 0; i < 24; i++) await h.frame();
  assert.equal(completed, 9); assert.equal(max, 1); assert.equal(h.frames.size, 0);
});
test("foreground transitions block queued captures across windows without losing work", async () => {
  const h = harness(); const audience = {}, presenter = {}; let count = 0;
  h.queue.enqueue(async () => { count++; });
  await h.frame();
  h.queue.block(audience, true); h.queue.block(presenter, true);
  await h.frame(); assert.equal(count, 0);
  h.queue.block(audience, false); await h.frame(); await h.frame(); assert.equal(count, 0);
  h.queue.block(presenter, false); await h.frame(); await h.frame(); assert.equal(count, 1);
});
test("cancellation removes queued views and failures allow the next capture", async () => {
  const h = harness(); let count = 0;
  const cancel = h.queue.enqueue(async () => { count++; }); cancel();
  await h.frame(); await h.frame(); assert.equal(count, 0);
  h.queue.enqueue(async () => { throw new Error("native capture failed"); });
  h.queue.enqueue(async () => { count++; });
  for (let i = 0; i < 8; i++) await h.frame();
  assert.equal(count, 1);
});
