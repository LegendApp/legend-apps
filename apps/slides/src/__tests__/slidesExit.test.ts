// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, mock, test } from "bun:test";
import { ownRegistration } from "../../../../packages/runtime-utils/src/ownRegistration";
mock.module("@legend-apps/runtime-utils", () => ({ ownRegistration }));
let listener: (event: { reason: string }) => void;

mock.module("@legendapp/spark/app", () => ({
  beforeQuit: (callback: typeof listener) => { listener = callback; return Promise.resolve({ remove: async () => {} }); },

}));
const { prepareDraftExit, prepareSlidesExit, registerSlidesExitPreparation, installSlidesExitHandler } = await import("../slidesExit");

test("clean drafts skip the prompt; cancellation and failed saves prevent exit", async () => {
  let dirty = false;
  const save = mock(async () => false);
  const choose = mock(async () => "cancel" as const);
  const session = { getSnapshot: () => ({ dirty }), save };
  expect(await prepareDraftExit(session, choose)).toBe(true);
  expect(choose).not.toHaveBeenCalled();
  dirty = true;
  expect(await prepareDraftExit(session, choose)).toBe(false);
  expect(save).not.toHaveBeenCalled();
  expect(await prepareDraftExit(session, async () => "save")).toBe(false);
  expect(await prepareDraftExit(session, async () => "discard")).toBe(true);
});

test("successful saves only permit exit if no newer edit remains", async () => {
  let dirty = true;
  const session = { getSnapshot: () => ({ dirty }), save: async () => true };
  expect(await prepareDraftExit(session, async () => "save")).toBe(false);
  session.save = async () => { dirty = false; return true; };
  expect(await prepareDraftExit(session, async () => "save")).toBe(true);
});

test("window close and Quit share a pending decision and Cancel replies to native termination", async () => {
  let decide!: (allow: boolean) => void;
  const handler = mock(() => new Promise<boolean>(resolve => { decide = resolve; }));
  const unregister = registerSlidesExitPreparation(handler);
  const subscription = installSlidesExitHandler();
  const closing = prepareSlidesExit();
  const firstQuit = listener();
  const secondQuit = listener();
  await Promise.resolve();
  expect(handler).toHaveBeenCalledTimes(1);
  decide(false);
  expect(await closing).toBe(false);
  await Promise.resolve();
  expect(await firstQuit).toBe(false);
  expect(await secondQuit).toBe(false);
  unregister(); await subscription.remove();
  expect(await prepareSlidesExit()).toBe(true);
});

test("preparation failures keep the app open", async () => {
  const unregister = registerSlidesExitPreparation(async () => { throw new Error("save failed"); });
  expect(await prepareSlidesExit()).toBe(false);
  unregister();
});
