import type { DragDropFileEvent } from "@legend-desktop/drag-drop";
import { getDroppedDiffSource, getUnsupportedDropMessage } from "../diffDrop";

function drop(event: Partial<DragDropFileEvent>): DragDropFileEvent {
  return {
    directories: [],
    files: [],
    urls: [],
    ...event,
  };
}

describe("diffDrop", () => {
  it("opens dropped folders", () => {
    expect(getDroppedDiffSource(drop({ directories: ["/tmp/repo"] }))).toEqual({
      kind: "folder",
      label: "repo",
      value: "/tmp/repo",
    });
  });

  it("opens dropped local diff files", () => {
    expect(getDroppedDiffSource(drop({ files: ["/tmp/change.diff"] }))).toEqual({
      kind: "diffFile",
      label: "change.diff",
      value: "/tmp/change.diff",
    });
  });

  it("opens dropped two-file comparisons", () => {
    expect(getDroppedDiffSource(drop({ files: ["/tmp/old.ts", "/tmp/new.ts"] }))).toEqual({
      kind: "filePair",
      label: "old.ts vs new.ts",
      newPath: "/tmp/new.ts",
      oldPath: "/tmp/old.ts",
      value: "/tmp/old.ts\n/tmp/new.ts",
    });
  });

  it("opens dropped GitHub URLs", () => {
    expect(getDroppedDiffSource(drop({ urls: ["https://github.com/owner/repo/pull/7"] }))).toEqual({
      diffUrl: "https://github.com/owner/repo/pull/7.diff",
      kind: "github",
      label: "owner/repo#7",
      value: "https://github.com/owner/repo/pull/7",
    });
  });

  it("describes unsupported drops", () => {
    expect(getUnsupportedDropMessage(drop({ files: ["/tmp/file.ts"] }))).toBe("Drop a .diff or .patch file, or drop two files to compare them.");
    expect(getUnsupportedDropMessage(drop({ files: ["/tmp/a.ts", "/tmp/b.ts", "/tmp/c.ts"] }))).toBe("Drop exactly two files to compare them.");
    expect(getUnsupportedDropMessage(drop({ urls: ["https://example.com"] }))).toBe("Drop a GitHub PR or commit URL.");
  });
});
