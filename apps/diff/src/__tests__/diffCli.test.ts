jest.mock("@legend-desktop/command-runner", () => ({
  commandRunner: {
    runCommand: jest.fn(),
  },
}));

jest.mock("@legend-desktop/storage", () => ({
  createStorage: jest.fn(),
}));

import {
  createLegendDiffCliProfileBlock,
  getLegendDiffCliScript,
  getProfilePathForShell,
  profileIncludesLegendDiffCliBlock,
} from "../diffCli";

describe("diffCli", () => {
  it("generates an ldiff script that opens the installed app with cwd and args", () => {
    const script = getLegendDiffCliScript();
    expect(script).toContain("for candidate in '/Applications/Legend Diff.app' \"${HOME:-}/Applications/Legend Diff.app\"");
    expect(script).toContain("Legend Diff is not installed. Move Legend Diff.app to /Applications or ~/Applications.");
    expect(script).toContain("legend-diff://open?cwd=$(urlencode \"$PWD\")");
    expect(script).toContain('url="${url}&arg=$(urlencode "$arg")"');
    expect(script).toContain('/usr/bin/open -a "$app_path" "$url"');
  });

  it("selects the interactive macOS profile for common shells", () => {
    expect(getProfilePathForShell("/bin/zsh", "/Users/jay")).toBe("/Users/jay/.zshrc");
    expect(getProfilePathForShell("/bin/bash", "/Users/jay")).toBe("/Users/jay/.bash_profile");
    expect(getProfilePathForShell("/opt/homebrew/bin/fish", "/Users/jay")).toBeNull();
    expect(getProfilePathForShell("/bin/zsh", null)).toBeNull();
  });

  it("matches only the current managed profile block", () => {
    const block = createLegendDiffCliProfileBlock("/Users/jay/Library/Application Support/Legend Diff/bin/legend-diff");
    expect(block).toContain("# >>> Legend Diff CLI >>>");
    expect(block).toContain("unalias ldiff 2>/dev/null || true");
    expect(block).toContain("ldiff() {");
    expect(block).toContain("  '/Users/jay/Library/Application Support/Legend Diff/bin/legend-diff' \"$@\"");
    expect(profileIncludesLegendDiffCliBlock(`before\n${block}\nafter`, "/Users/jay/Library/Application Support/Legend Diff/bin/legend-diff")).toBe(true);
    expect(profileIncludesLegendDiffCliBlock(block, "/tmp/other/legend-diff")).toBe(false);
  });
});
