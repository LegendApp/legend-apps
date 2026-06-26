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
  it("generates an ld script that opens the legend-diff URL scheme with cwd and args", () => {
    expect(getLegendDiffCliScript()).toContain("legend-diff://open?cwd=$(urlencode \"$PWD\")");
    expect(getLegendDiffCliScript()).toContain('url="${url}&arg=$(urlencode "$arg")"');
    expect(getLegendDiffCliScript()).toContain('/usr/bin/open "$url"');
  });

  it("selects the interactive macOS profile for common shells", () => {
    expect(getProfilePathForShell("/bin/zsh", "/Users/jay")).toBe("/Users/jay/.zshrc");
    expect(getProfilePathForShell("/bin/bash", "/Users/jay")).toBe("/Users/jay/.bash_profile");
    expect(getProfilePathForShell("/opt/homebrew/bin/fish", "/Users/jay")).toBeNull();
    expect(getProfilePathForShell("/bin/zsh", null)).toBeNull();
  });

  it("matches only the current managed profile block", () => {
    const block = createLegendDiffCliProfileBlock("/Users/jay/Library/Application Support/Legend Diff/bin/ld");
    expect(block).toContain("# >>> Legend Diff CLI >>>");
    expect(block).toContain("alias ld='/Users/jay/Library/Application Support/Legend Diff/bin/ld'");
    expect(profileIncludesLegendDiffCliBlock(`before\n${block}\nafter`, "/Users/jay/Library/Application Support/Legend Diff/bin/ld")).toBe(true);
    expect(profileIncludesLegendDiffCliBlock(block, "/tmp/other/ld")).toBe(false);
  });
});
