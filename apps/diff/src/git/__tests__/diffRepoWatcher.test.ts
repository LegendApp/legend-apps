import type { DirectoryChangeEvent } from "@legend-apps/file-system-watcher";
import { GitIndexLockedError } from "../GitService";
import { shouldRefreshDiffRepo, watchDiffRepo, type DiffRepoWatchLocations } from "../diffRepoWatcher";

const locations: DiffRepoWatchLocations = {
  root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: ["ignored/", "ignored.txt"],
};
const event = (filePath = "/repo/file.ts"): DirectoryChangeEvent => ({ path: "/repo", filePath, type: "change", contentChanged: true });
function setup(reload = jest.fn(async () => {}), suppressedUntil?: () => number) {
  let notify!: (event: DirectoryChangeEvent) => void;
  const remove = jest.fn();
  const watch = jest.fn((_directories: string[], listener: typeof notify) => { notify = listener; return { remove }; });
  const onError = jest.fn();
  const subscription = watchDiffRepo({ locations: { ...locations }, watch, reload, onError, suppressedUntil });
  return { notify: (path?: string) => notify(event(path)), reload, watch, remove, onError, subscription };
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it("debounces a burst for 300ms after the last event and coalesces it into one reload", async () => {
  const test = setup();
  test.notify();
  await jest.advanceTimersByTimeAsync(200);
  test.notify("/repo/.git/HEAD");
  test.notify("/repo/.git/index");
  await jest.advanceTimersByTimeAsync(299);
  expect(test.reload).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(test.reload).toHaveBeenCalledTimes(1);
  test.subscription.remove();
});

it("skips index locks and retries without a new event after the lock goes away", async () => {
  const reload = jest.fn(async () => {});
  reload.mockRejectedValueOnce(new GitIndexLockedError("/repo/.git/index.lock"));
  const test = setup(reload);
  test.notify();
  await jest.advanceTimersByTimeAsync(300);
  expect(test.reload).toHaveBeenCalledTimes(1);
  expect(test.onError).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(300);
  expect(test.reload).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(900);
  expect(test.reload).toHaveBeenCalledTimes(2);
  test.subscription.remove();
});

it("runs only one reload at a time and retains a burst received while it is running", async () => {
  let finish!: () => void;
  const reload = jest.fn(async () => {});
  reload.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const test = setup(reload);
  test.notify();
  await jest.advanceTimersByTimeAsync(300);
  test.notify();
  test.notify();
  await jest.advanceTimersByTimeAsync(600);
  expect(reload).toHaveBeenCalledTimes(1);
  finish();
  await jest.advanceTimersByTimeAsync(300);
  expect(reload).toHaveBeenCalledTimes(2);
  test.subscription.remove();
});

it("retains a change during merge-save suppression and stops all timers/subscriptions on close", async () => {
  const test = setup(undefined, () => 1000);
  jest.setSystemTime(0);
  test.notify();
  await jest.advanceTimersByTimeAsync(999);
  expect(test.reload).not.toHaveBeenCalled();
  await jest.advanceTimersByTimeAsync(1);
  expect(test.reload).toHaveBeenCalledTimes(1);
  test.notify();
  test.subscription.remove();
  await jest.advanceTimersByTimeAsync(1000);
  test.notify();
  expect(test.reload).toHaveBeenCalledTimes(1);
  expect(test.remove).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

it("does not retry ordinary errors or restart after close during an index-lock probe", async () => {
  const reload = jest.fn(async () => { throw new Error("read failed"); });
  const test = setup(reload);
  test.notify();
  await jest.advanceTimersByTimeAsync(1200);
  expect(test.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "read failed" }));
  expect(reload).toHaveBeenCalledTimes(1);
  test.subscription.remove();

  let reject!: (error: unknown) => void;
  const pending = setup(jest.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; })));
  pending.notify();
  await jest.advanceTimersByTimeAsync(300);
  pending.subscription.remove();
  reject(new GitIndexLockedError("/repo/.git/index.lock"));
  await jest.advanceTimersByTimeAsync(1000);
  expect(pending.onError).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

it.each([
  ["/repo/.git/objects/ab/cdef", false], ["/repo/.git/logs/HEAD", false],
  ["/repo/node_modules/pkg/file", false], ["/repo/app/build/file", false], ["/repo/dist/file", false],
  ["/repo/ignored/file", false], ["/repo/ignored.txt", false], ["/repository/file", false],
  ["/repo/.git/HEAD", true], ["/repo/.git/index", true], ["/repo/.git/index.lock", true],
  ["/repo/.git/refs/heads/main", true], ["/repo/.git/rebase-merge/head-name", true],
  ["/repo/.git/MERGE_HEAD", true], ["/repo/file.ts", true], ["/repo/.gitignore", true],
])("filters %s -> %s", (path, expected) => {
  expect(shouldRefreshDiffRepo(event(path), locations)).toBe(expected);
});

it("watches both linked-worktree metadata and common refs, ignores content-free notifications", () => {
  const linked = { ...locations, root: "/linked", gitDir: "/repo/.git/worktrees/linked" };
  expect(shouldRefreshDiffRepo(event("/linked/file"), linked)).toBe(true);
  expect(shouldRefreshDiffRepo(event("/repo/.git/worktrees/linked/HEAD"), linked)).toBe(true);
  expect(shouldRefreshDiffRepo(event("/repo/.git/refs/heads/main"), linked)).toBe(true);
  expect(shouldRefreshDiffRepo({ ...event(), contentChanged: false }, locations)).toBe(false);
  const watch = jest.fn(() => ({ remove() {} }));
  watchDiffRepo({ locations: linked, watch, reload: async () => {}, onError: jest.fn() }).remove();
  expect(watch).toHaveBeenCalledWith(["/linked", "/repo/.git/worktrees/linked", "/repo/.git"], expect.any(Function));
});

it("invalidates ignored paths when ignore rules change so newly unignored files refresh", async () => {
  const test = setup();
  test.notify("/repo/ignored.txt");
  await jest.advanceTimersByTimeAsync(300);
  expect(test.reload).not.toHaveBeenCalled();
  test.notify("/repo/.gitignore");
  await jest.advanceTimersByTimeAsync(300);
  test.notify("/repo/ignored.txt");
  await jest.advanceTimersByTimeAsync(300);
  expect(test.reload).toHaveBeenCalledTimes(2);
  test.subscription.remove();
});
