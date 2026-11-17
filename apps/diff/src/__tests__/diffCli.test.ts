jest.mock("@legendapp/spark/processes", () => ({
  runCommand: jest.fn(),
}));

jest.mock("@legend-apps/storage", () => ({
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

describe("ldiff story", () => {
  const { execFileSync } = require("child_process") as typeof import("child_process");
  const { mkdtempSync, rmSync, writeFileSync } = require("fs") as typeof import("fs");
  const { tmpdir } = require("os") as typeof import("os");
  const folders: string[] = [];
  afterAll(() => folders.forEach(folder => rmSync(folder, { recursive: true, force: true })));
  function writeScript() {
    const folder = mkdtempSync(`${tmpdir()}/ldiff-test-`);
    folders.push(folder);
    const path = `${folder}/legend-diff`;
    writeFileSync(path, getLegendDiffCliScript(), { mode: 0o755 });
    return path;
  }

  it("is valid zsh and prints help without launching the app", () => {
    const path = writeScript();
    execFileSync("/bin/zsh", ["-n", path]);
    expect(execFileSync("/bin/zsh", [path, "--help"], { encoding: "utf8" })).toContain("ldiff story [comparison] [options]");
    const help = execFileSync("/bin/zsh", [path, "story", "--commit", "abc", "--help"], { encoding: "utf8" });
    expect(help).toContain("Usage: ldiff story [comparison] [--agent claude|codex] [--model <name>] [--skill <name>] [--out <file>] [--json]");
    expect(help).toContain("--agent claude|codex");
  });

  it("URL-encodes arguments that look like options", () => {
    const script = getLegendDiffCliScript();
    const urlencode = script.slice(script.indexOf("urlencode() {"), script.indexOf("}\n", script.indexOf("urlencode() {")) + 2);
    const output = execFileSync("/bin/zsh", ["-c", `${urlencode}\nurlencode --commit; urlencode "a b&c"; urlencode ""`], { encoding: "utf8" });
    expect(output).toBe("--commit\na%20b%26c\n\n");
  });

  it("sends story requests through a private request folder opened in the background", () => {
    const script = getLegendDiffCliScript();
    expect(script).toContain('request_dir="$(/usr/bin/mktemp -d "${tmp_root%/}/legend-diff-story.XXXXXXXX")"');
    expect(script).toContain('{ urlencode "$PWD"; for arg in "$@"; do urlencode "$arg"; done } > "$request_dir/request"');
    expect(script).toContain('/usr/bin/open -g -j -a "$app_path" "legend-diff://story?request=$(urlencode "$request_dir")" --args "--story-request=$request_dir"');
    expect(script).toContain('exit "$(/bin/cat "$request_dir/exit")"');
  });
});
