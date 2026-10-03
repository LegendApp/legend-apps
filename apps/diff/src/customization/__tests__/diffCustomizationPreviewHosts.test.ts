import { createDiffCustomizationPreviewHosts } from "../diffCustomizationPreviewHosts";

it("allows sample rendering while blocking file writes, processes and loading real sources", () => {
  const sample = jest.fn(() => "sample");
  const write = jest.fn();
  const metadata = jest.fn();
  const hosts = {
    "@legend-apps/diff-parser": { loadUnifiedDiffFile: sample, startGitFolderDiff: jest.fn() },
    "@legendapp/spark/processes": { runCommand: jest.fn(), spawn: jest.fn(), resolveCommand: jest.fn() },
    "@legendapp/spark/files": { writeText: write, readText: jest.fn() },
    "diff-host/diffMerge": { writeDiffMergeFileContent: write },
    "diff-host/diffFiles": { openDiffFolderDialog: jest.fn() },
    "diff-host/diffAppMetadata": { addRecentDiffSource: metadata, getRecentDiffSources: jest.fn() },
  };
  const preview = createDiffCustomizationPreviewHosts(hosts, "/sample.diff") as Record<string, Record<string, (...args: any[]) => unknown>>;
  expect(preview["@legend-apps/diff-parser"]!.loadUnifiedDiffFile!("/sample.diff")).toBe("sample");
  expect(() => preview["@legend-apps/diff-parser"]!.loadUnifiedDiffFile!("/user/file")).toThrow("preview");
  expect(() => preview["@legendapp/spark/processes"]!.spawn!()).toThrow("preview");
  expect(() => preview["@legendapp/spark/files"]!.writeText!()).toThrow("preview");
  expect(() => preview["diff-host/diffMerge"]!.writeDiffMergeFileContent!()).toThrow("preview");
  preview["diff-host/diffAppMetadata"]!.addRecentDiffSource!();
  expect(write).not.toHaveBeenCalled();
  expect(metadata).not.toHaveBeenCalled();
  expect(hosts["@legendapp/spark/files"].writeText).toBe(write);
  expect(preview["@legendapp/spark/files"]!.readText).toBe(hosts["@legendapp/spark/files"].readText);
});
