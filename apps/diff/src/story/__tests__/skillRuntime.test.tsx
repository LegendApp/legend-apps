import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as files from "@legendapp/spark/files";
import { watchDirectories } from "@legend-apps/file-system-watcher";
import { useSkillLibrary } from "../skillRuntime";
import { changeStoryMarkdown } from "../storySkill";

jest.mock("@legendapp/spark/files", () => ({ mkdir: jest.fn(async () => {}), exists: jest.fn(async () => false), list: jest.fn(async () => []), readText: jest.fn(), writeChunks: jest.fn(async () => 0), writeTextIfUnchanged: jest.fn(), remove: jest.fn() }));
jest.mock("@legend-apps/file-system-watcher", () => ({ watchDirectories: jest.fn(() => ({ remove: jest.fn() })) }));
jest.mock("@legend-apps/storage", () => ({ ...jest.requireActual("@legend-apps/storage"), getApplicationSupportDirectory: () => ({ uri: "file:///Users/person/Library/Application%20Support/Legend%20Diff/" }) }));
beforeEach(() => jest.clearAllMocks());
it("shares one watched library per repo across viewer and settings, and releases it with the last consumer", async () => {
  const viewer = await renderHook(() => useSkillLibrary("/repo"));
  const settings = await renderHook(() => useSkillLibrary("/repo"));
  await waitFor(() => expect(viewer.result.current.state?.ready).toBe(true));
  await waitFor(() => expect(settings.result.current.state?.ready).toBe(true));
  expect(viewer.result.current.library).toBe(settings.result.current.library);
  expect(files.mkdir).toHaveBeenCalledWith("/Users/person/Library/Application Support/Legend Diff/skills");
  expect(watchDirectories).toHaveBeenCalledTimes(1);
  await act(async () => { await viewer.result.current.library!.duplicate(viewer.result.current.state!.active[0]); });
  expect(files.writeChunks).toHaveBeenCalledWith("/Users/person/Library/Application Support/Legend Diff/skills/change-story.md", [expect.any(Uint8Array)], { mode: "createNew" });
  const subscription = jest.mocked(watchDirectories).mock.results[0].value;
  await viewer.unmount(); expect(subscription.remove).not.toHaveBeenCalled();
  await settings.unmount(); expect(subscription.remove).toHaveBeenCalledTimes(1);
});
it("keeps repo overrides out of another repo and does no IO while disabled", async () => {
  jest.mocked(files.exists).mockImplementation(async path => path === "/repo/.legend-diff/skills");
  jest.mocked(files.list).mockImplementation(async path => path === "/repo/.legend-diff/skills" ? [{ name: "story.md", path: `${path}/story.md` }] : []);
  jest.mocked(files.readText).mockResolvedValue(changeStoryMarkdown);
  const disabled = await renderHook(() => useSkillLibrary("/repo", false));
  expect(files.mkdir).not.toHaveBeenCalled();
  const viewer = await renderHook(() => useSkillLibrary("/repo"));
  const other = await renderHook(() => useSkillLibrary("/other"));
  await waitFor(() => expect(viewer.result.current.state?.ready).toBe(true));
  await waitFor(() => expect(other.result.current.state?.ready).toBe(true));
  expect(viewer.result.current.state?.active.find(skill => skill.name === "change-story")?.layer).toBe("repo");
  expect(other.result.current.state?.active.find(skill => skill.name === "change-story")?.layer).toBe("built-in");
  await act(async () => { await disabled.unmount(); await viewer.unmount(); await other.unmount(); });
});

it("reports watcher failures and lets the next consumer retry without a stranded library", async () => {
  jest.mocked(watchDirectories).mockImplementationOnce(() => { throw new Error("Watcher unavailable"); });
  const failed = await renderHook(() => useSkillLibrary("/failed"));
  await waitFor(() => expect(failed.result.current.error).toBe("Watcher unavailable"));
  await failed.unmount();
  const retry = await renderHook(() => useSkillLibrary("/failed"));
  await waitFor(() => expect(retry.result.current.state?.ready).toBe(true));
  expect(retry.result.current.error).toBeUndefined();
  await retry.unmount();
});
