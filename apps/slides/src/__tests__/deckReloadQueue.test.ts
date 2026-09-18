// @ts-ignore Bun's test module is supplied by the test runner.
import { expect, it } from "bun:test";
import { createDeckReloadQueue } from "../deckReloadQueue";

const settle = () => new Promise((resolve) => setTimeout(resolve, 15));

it("ignores metadata, coalesces saves, and queues edits arriving during a build", async () => {
  let builds = 0;
  let finish!: () => void;
  const queue = createDeckReloadQueue(async () => {
    builds++;
    await new Promise<void>((resolve) => { finish = resolve; });
  }, 1);
  queue.changed({ contentChanged: false });
  await settle();
  expect(builds).toBe(0);
  queue.changed({ contentChanged: true });
  queue.changed({}); // Older native binaries omit contentChanged.
  await settle();
  expect(builds).toBe(1);
  queue.changed({ contentChanged: true });
  await settle();
  expect(builds).toBe(1);
  finish();
  await settle();
  expect(builds).toBe(2);
  finish();
  queue.dispose();
});

it("drops queued edits when the watched deck changes", async () => {
  let builds = 0;
  let finish!: () => void;
  const queue = createDeckReloadQueue(async () => {
    builds++;
    await new Promise<void>((resolve) => { finish = resolve; });
  }, 1);
  queue.changed({});
  await settle();
  queue.changed({});
  queue.dispose();
  finish();
  await settle();
  expect(builds).toBe(1);
});
