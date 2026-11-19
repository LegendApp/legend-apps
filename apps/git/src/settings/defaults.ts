import type { GitSettings } from "./schema";

const fileList = { style: "flat", sort: "path", showFolder: true, stagingControl: "buttons" } as const;

/**
 * Layer 0: every key resolved. Values match the app before settings existed (HistoryView's lane width and palette,
 * FileRow's status colors, diff-parser's diff palette), so the default preset changes nothing on its own.
 */
export const defaultSettings: GitSettings = {
  appearance: "system",
  density: "regular",
  theme: {
    name: "Default",
    fonts: { code: "system-mono", codeSize: 12 },
    light: {
      accent: "system:controlAccentColor",
      status: { added: "#28CD41", modified: "#FF9500", deleted: "#FF3B30", renamed: "#007AFF", typeChanged: "#AF52DE", untracked: "#8E8E93", conflicted: "#FF3B30" },
      diff: { addedLine: "#dafbe1", removedLine: "#ffebe9", addedWord: "#1a7f37", removedWord: "#cf222e", hunkHeader: "system:secondaryLabelColor", gutter: "system:tertiaryLabelColor", selection: "system:selectedContentBackgroundColor" },
      lanes: ["#007AFF", "#AF52DE", "#FF2D55", "#FF9500", "#28CD41", "#30B0C7", "#5856D6", "#A2845E", "#FF3B30", "#FFCC00", "#00000042"],
      refs: { localBranch: "#007AFF", remoteBranch: "#8E8E93", tag: "#FF9500", head: "#28CD41" },
    },
    dark: {
      accent: "system:controlAccentColor",
      status: { added: "#32D74B", modified: "#FF9F0A", deleted: "#FF453A", renamed: "#0A84FF", typeChanged: "#BF5AF2", untracked: "#98989D", conflicted: "#FF453A" },
      diff: { addedLine: "#17351f", removedLine: "#3a1d24", addedWord: "#7ee787", removedWord: "#ff7b72", hunkHeader: "system:secondaryLabelColor", gutter: "system:tertiaryLabelColor", selection: "system:selectedContentBackgroundColor" },
      lanes: ["#0A84FF", "#BF5AF2", "#FF375F", "#FF9F0A", "#32D74B", "#40C8E0", "#5E5CE6", "#AC8E68", "#FF453A", "#FFD60A", "#FFFFFF40"],
      refs: { localBranch: "#0A84FF", remoteBranch: "#98989D", tag: "#FF9F0A", head: "#32D74B" },
    },
  },
  layout: { active: "sourcetree", layouts: {}, sizes: {} },
  panels: {
    commitList: {
      columns: [{ id: "graph" }, { id: "subject" }, { id: "author", width: 160 }, { id: "date", width: 140 }, { id: "sha", width: 72 }],
      graph: { style: "wide", laneWidth: 12, nodeStyle: "dot", lineWidth: 2, maxLanes: 12, colorBy: "lane" },
      refs: "inline", refStyle: "text", showRemoteRefs: true, showTags: true, dateFormat: "relative", highlightPulled: false,
    },
    commitDetails: { showBody: true, showCommitter: true, fileListPlacement: "none" },
    fileList,
    unstaged: fileList,
    staged: fileList,
    changes: fileList,
    composer: { bodyLines: 4, showAmend: true, showSignOff: false, showGenerate: true },
    diff: { mode: "unified", sideBySideSplit: "vertical", wrap: false, contextLines: 3, showWhitespace: false, ignoreWhitespace: "none", lineNumbers: "both", hunkActions: "none" },
    prDetails: { showChecks: true },
    empty: {},
  },
  sidebar: {
    sections: [{ id: "workspace" }, { id: "reviewQueue" }, { id: "branches" }, { id: "remotes" }, { id: "tags" }, { id: "stashes" }, { id: "worktrees" }, { id: "pullRequests" }],
    showCounts: true,
  },
  toolbar: { displayMode: "iconAndLabel", items: ["toggle-sidebar", "branchPicker", "flexibleSpace", "viewSwitcher", "networkProgress", "refresh", "search"] },
  contextMenus: {},
  keybindings: {},
};
