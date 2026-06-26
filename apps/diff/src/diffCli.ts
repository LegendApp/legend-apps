import { commandRunner } from "@legend-desktop/command-runner";
import { createStorage } from "@legend-desktop/storage";

const cliScriptRelativePath = "bin/ld";
const managedBlockStart = "# >>> Legend Diff CLI >>>";
const managedBlockEnd = "# <<< Legend Diff CLI <<<";

export type DiffCliInstallStatus = {
  installed: boolean;
  profileInstalled: boolean;
  profilePath: string | null;
  scriptExecutable: boolean;
  scriptInstalled: boolean;
  scriptPath: string;
  shell: string | null;
};

function fileUriToPath(value: string) {
  if (value.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(value).pathname);
    } catch {
      return value.replace(/^file:\/\//, "");
    }
  }
  return value;
}

function normalizeHomePath(path: string) {
  return path.replace(/\/+$/, "");
}

function getShellName(shell: string | null | undefined) {
  const value = shell?.trim();
  if (!value) {
    return null;
  }
  const separatorIndex = value.lastIndexOf("/");
  return separatorIndex >= 0 ? value.slice(separatorIndex + 1) : value;
}

export function getLegendDiffCliScript() {
  return `#!/bin/zsh
emulate -L zsh
set -e

urlencode() {
  /usr/bin/osascript -l JavaScript -e 'function run(argv) { return encodeURIComponent(argv[0]); }' "$1"
}

url="legend-diff://open?cwd=$(urlencode "$PWD")"
for arg in "$@"; do
  url="\${url}&arg=$(urlencode "$arg")"
done

/usr/bin/open "$url"
`;
}

export function getProfilePathForShell(shell: string | null | undefined, home: string | null | undefined) {
  const normalizedHome = home ? normalizeHomePath(home) : null;
  const shellName = getShellName(shell);
  if (!normalizedHome || !shellName) {
    return null;
  }
  if (shellName === "zsh") {
    return `${normalizedHome}/.zshrc`;
  }
  if (shellName === "bash") {
    return `${normalizedHome}/.bash_profile`;
  }
  return null;
}

function shellSingleQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function createLegendDiffCliProfileBlock(scriptPath: string) {
  return `${managedBlockStart}
alias ld=${shellSingleQuote(scriptPath)}
${managedBlockEnd}`;
}

export function profileIncludesLegendDiffCliBlock(content: string, scriptPath: string) {
  return content.includes(createLegendDiffCliProfileBlock(scriptPath));
}

function getCliStorage() {
  return createStorage();
}

export function getLegendDiffCliScriptPath() {
  return fileUriToPath(getCliStorage().file(cliScriptRelativePath).uri);
}

async function getShellEnvironment() {
  const result = await commandRunner.runCommand({
    args: ["-c", "printf '%s\\n%s\\n' \"${HOME:-}\" \"${SHELL:-}\""],
    command: "/bin/sh",
    timeoutMs: 1000,
  });
  const [home = "", shell = ""] = result.stdout.split("\n");
  return {
    home: home.trim() || null,
    shell: shell.trim() || null,
  };
}

async function readProfile(profilePath: string) {
  const result = await commandRunner.runCommand({
    args: [profilePath],
    command: "/bin/cat",
    timeoutMs: 1000,
  }).catch(() => null);
  return result?.exitCode === 0 ? result.stdout : "";
}

async function isExecutable(path: string) {
  const result = await commandRunner.runCommand({
    args: ["-c", "test -x \"$1\"", "sh", path],
    command: "/bin/sh",
    timeoutMs: 1000,
  }).catch(() => null);
  return result?.exitCode === 0;
}

async function writeCliScript(scriptPath: string) {
  const storage = getCliStorage();
  storage.write(cliScriptRelativePath, getLegendDiffCliScript(), { format: "text" });
  const result = await commandRunner.runCommand({
    args: ["755", scriptPath],
    command: "/bin/chmod",
    timeoutMs: 1000,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || "Unable to mark ld as executable.");
  }
}

async function installProfileBlock(profilePath: string, scriptPath: string) {
  const result = await commandRunner.runCommand({
    args: ["-s", profilePath, scriptPath],
    command: "/bin/sh",
    input: `${managedBlockStart}
${managedBlockEnd}
profile_path="$1"
script_path="$2"
quote_shell() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}
block="$(printf '%s\\nalias ld=%s\\n%s\\n' '${managedBlockStart}' "$(quote_shell "$script_path")" '${managedBlockEnd}')"
mkdir -p "$(dirname "$profile_path")"
touch "$profile_path"
tmp_file="$(mktemp)"
sed '/^${managedBlockStart}$/,/^${managedBlockEnd}$/d' "$profile_path" > "$tmp_file"
if [ -s "$tmp_file" ]; then
  printf '\\n' >> "$tmp_file"
fi
printf '%s\\n' "$block" >> "$tmp_file"
cat "$tmp_file" > "$profile_path"
rm -f "$tmp_file"
`,
    timeoutMs: 3000,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Unable to update ${profilePath}.`);
  }
}

export async function getDiffCliInstallStatus(): Promise<DiffCliInstallStatus> {
  const scriptPath = getLegendDiffCliScriptPath();
  const { home, shell } = await getShellEnvironment();
  const profilePath = getProfilePathForShell(shell, home);
  const profileContent = profilePath ? await readProfile(profilePath) : "";
  const scriptInstalled = getCliStorage().read(cliScriptRelativePath, { format: "text" }) === getLegendDiffCliScript();
  const scriptExecutable = await isExecutable(scriptPath);
  const profileInstalled = profilePath ? profileIncludesLegendDiffCliBlock(profileContent, scriptPath) : false;
  return {
    installed: scriptInstalled && scriptExecutable && profileInstalled,
    profileInstalled,
    profilePath,
    scriptExecutable,
    scriptInstalled,
    scriptPath,
    shell,
  };
}

export async function installDiffCli() {
  const scriptPath = getLegendDiffCliScriptPath();
  const { home, shell } = await getShellEnvironment();
  const profilePath = getProfilePathForShell(shell, home);
  if (!profilePath) {
    throw new Error("Could not find a supported shell profile for zsh or bash.");
  }
  await writeCliScript(scriptPath);
  await installProfileBlock(profilePath, scriptPath);
  return getDiffCliInstallStatus();
}
