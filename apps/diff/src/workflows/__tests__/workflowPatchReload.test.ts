import { loadGitFolderDiff, loadUnifiedDiff } from "@legend-apps/diff-parser";
import { runCommand } from "@legendapp/spark/processes";
import { reloadWorkflowPatchInput } from "../workflowPatch";
import { fixtureDocument, repoSource } from "../../story/__tests__/storyFixtures";
import { processResult } from "../../__tests__/processFixtures";
import type { DiffOpenSource } from "../../diffFiles";

function setup() {
  const document = { ...fixtureDocument(), releaseNativeResources: jest.fn() };
  jest.mocked(loadGitFolderDiff).mockResolvedValue({ document } as unknown as Awaited<ReturnType<typeof loadGitFolderDiff>>);
  jest.mocked(loadUnifiedDiff).mockResolvedValue({ document } as unknown as Awaited<ReturnType<typeof loadUnifiedDiff>>);
  jest.mocked(runCommand).mockResolvedValue(processResult({ stdout: "diff --git a/a b/a\n" }));
  return document;
}
beforeEach(() => jest.clearAllMocks());
const settings = { showOnlyHunks: true, ignoreWhitespaceChanges: true };
it("reloads folder compare options natively and always disposes the temporary document", async () => {
  const document = setup();
  const source = { ...repoSource, kind: "folder", compareBase: { kind: "ref", ref: "main", useMergeBase: false } } as DiffOpenSource;
  const input = await reloadWorkflowPatchInput(source, settings);
  expect(input.hunks.length).toBeGreaterThan(0);
  expect(loadGitFolderDiff).toHaveBeenCalledWith("/repo", 0, { ...settings, compareBaseKind: "ref", compareBaseRef: "main", compareUseMergeBase: false });
  expect(document.releaseNativeResources).toHaveBeenCalledTimes(1);
});
it("rereads Git sources directly without entering the repository transaction queue", async () => {
  const document = setup();
  const source: DiffOpenSource = { kind: "head-vs-index", cwd: "/repo", value: "/repo staged", label: "Staged" };
  await reloadWorkflowPatchInput(source, settings);
  expect(runCommand).toHaveBeenCalledWith(expect.objectContaining({ cwd: "/repo", args: ["diff", "-z", "--no-ext-diff", "--no-color", "--ignore-all-space", "--cached", "--"] }));
  expect(loadUnifiedDiff).toHaveBeenCalledWith("diff --git a/a b/a\n", "Staged", 0, true);
  expect(document.releaseNativeResources).toHaveBeenCalledTimes(1);
});
it("releases native resources when cancelled during a folder load", async () => {
  const document = setup(); const controller = new AbortController(); controller.abort();
  await expect(reloadWorkflowPatchInput(repoSource, settings, controller.signal)).rejects.toThrow("cancelled");
  expect(document.releaseNativeResources).toHaveBeenCalledTimes(1);
});
