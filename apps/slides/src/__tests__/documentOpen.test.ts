// @ts-expect-error Bun test types are not part of the React Native app configuration.
import { expect, test } from "bun:test";
import { openRequestedDocument, registerDocumentOpenGuard } from "../documentOpen";

test("Finder opens a presenter and loads the deck even with no presenter mounted", async () => {
  const calls: string[] = [];
  await openRequestedDocument("deck.mdx", async () => { calls.push("presenter"); }, async path => { calls.push(path); }, () => { throw Error("blocked"); });
  expect(calls).toEqual(["presenter", "deck.mdx"]);
});

test("Finder respects editing both before and during an asynchronous window open", async () => {
  let editing = true, loaded = false, blocked = 0;
  const unregister = registerDocumentOpenGuard(() => !editing);
  const load = async () => { loaded = true; };
  const block = () => { blocked++; };
  await openRequestedDocument("deck", async () => { throw Error("must not open"); }, load, block);
  editing = false;
  await openRequestedDocument("deck", async () => { editing = true; }, load, block);
  expect(loaded).toBe(false);
  expect(blocked).toBe(2);
  unregister();
  await openRequestedDocument("deck", async () => {}, load, block);
  expect(loaded).toBe(true);
});

test("failed presenter creation does not replace the deck", async () => {
  await expect(openRequestedDocument("deck", async () => { throw Error("window failed"); }, async () => { throw Error("must not load"); }, () => {})).rejects.toThrow("window failed");
});

test("the latest Finder request wins even when window opens finish out of order", async () => {
  let finish!: () => void;
  const loaded: string[] = [];
  const load = async (path: string) => { loaded.push(path); };
  const first = openRequestedDocument("old", () => new Promise<void>(resolve => { finish = resolve; }), load, () => {});
  await openRequestedDocument("new", async () => {}, load, () => {});
  finish(); await first;
  expect(loaded).toEqual(["new"]);
});
