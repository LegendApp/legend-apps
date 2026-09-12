import { createDocumentTransitionGuard } from "../../../document-app/src/documentTransition";

test("cancel prevents replacement and concurrent transitions cannot bypass the prompt", async () => {
  const guard = createDocumentTransitionGuard();
  const replace = jest.fn();
  let respond!: (allowed: boolean) => void;
  const pending = guard(() => new Promise((resolve) => { respond = resolve; }), replace);
  expect(await guard(async () => true, replace)).toBe(false);
  respond(false);
  expect(await pending).toBe(false);
  expect(replace).not.toHaveBeenCalled();
  expect(await guard(async () => true, replace)).toBe(true);
  expect(replace).toHaveBeenCalledTimes(1);
});
test("failed save preserves the document and releases the guard", async () => {
  const guard = createDocumentTransitionGuard(), replace = jest.fn();
  await expect(guard(async () => { throw Error("disk full"); }, replace)).rejects.toThrow("disk full");
  expect(replace).not.toHaveBeenCalled();
  expect(await guard(async () => true, replace)).toBe(true);
});
