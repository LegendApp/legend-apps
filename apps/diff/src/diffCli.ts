import { decodeProcessText } from "@legend-apps/runtime-utils";
import { runCommand } from "@legendapp/spark/processes";
import { createStorage } from "@legend-apps/storage";

const cliCommandName = "ldiff";
const cliScriptRelativePath = "bin/legend-diff";
const installedAppName = "Legend Diff.app";
const installedAppPath = `/Applications/${installedAppName}`;
const userInstalledAppRelativePath = `Applications/${installedAppName}`;
const managedBlockStart = "# >>> Legend Diff CLI >>>";
const managedBlockEnd = "# <<< Legend Diff CLI <<<";

export type DiffCliInstallStatus = {
  appInstalled: boolean;
  appPath: string | null;
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

export function getLegendDiffCliScript() {
  return `#!/bin/zsh
emulate -L zsh
set -e

app_path=""
for candidate in ${shellSingleQuote(installedAppPath)} "\${HOME:-}/${userInstalledAppRelativePath}"; do
  if [ -d "$candidate" ]; then
    app_path="$candidate"
    break
  fi
done

if [ -z "$app_path" ]; then
  printf '%s\\n' "Legend Diff is not installed. Move ${installedAppName} to /Applications or ~/Applications." >&2
  exit 1
fi

urlencode() {
  /usr/bin/osascript -l JavaScript -e 'function run(argv) { return encodeURIComponent(argv[0]); }' "$1"
}

url="legend-diff://open?cwd=$(urlencode "$PWD")"
for arg in "$@"; do
  url="\${url}&arg=$(urlencode "$arg")"
done

/usr/bin/open -a "$app_path" "$url"
`;
}

export function createLegendDiffCliProfileBlock(scriptPath: string) {
  return `${managedBlockStart}
unalias ${cliCommandName} 2>/dev/null || true
${cliCommandName}() {
  ${shellSingleQuote(scriptPath)} "$@"
}
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
  const result = await runCommand({
    args: ["-c", "printf '%s\\n%s\\n' \"${HOME:-}\" \"${SHELL:-}\""],
    target: { type: "executable", path: "/bin/sh" },
    timeoutMs: 1000,
  });
  const [home = "", shell = ""] = decodeProcessText(result.stdout).split("\n");
  return {
    home: home.trim() || null,
    shell: shell.trim() || null,
  };
}

async function readProfile(profilePath: string) {
  const result = await runCommand({
    args: [profilePath],
    target: { type: "executable", path: "/bin/cat" },
    timeoutMs: 1000,
  }).catch(() => null);
  return result && result.exit.type === "exited" && result.exit.code === 0 ? decodeProcessText(result.stdout) : "";
}

async function directoryExists(path: string) {
  const result = await runCommand({
    args: ["-c", "test -d \"$1\"", "sh", path],
    target: { type: "executable", path: "/bin/sh" },
    timeoutMs: 1000,
  }).catch(() => null);
  return (result?.exit.type === "exited" ? result.exit.code : -1) === 0;
}

function getInstalledAppPathCandidates(home: string | null | undefined) {
  const candidates = [installedAppPath];
  if (home) {
    candidates.push(`${normalizeHomePath(home)}/${userInstalledAppRelativePath}`);
  }
  return candidates;
}

async function getInstalledAppPath(home: string | null | undefined) {
  let appPath: string | null = null;
  for (const candidate of getInstalledAppPathCandidates(home)) {
    if (!appPath && await directoryExists(candidate)) {
      appPath = candidate;
    }
  }
  return appPath;
}

async function isExecutable(path: string) {
  const result = await runCommand({
    args: ["-c", "test -x \"$1\"", "sh", path],
    target: { type: "executable", path: "/bin/sh" },
    timeoutMs: 1000,
  }).catch(() => null);
  return (result?.exit.type === "exited" ? result.exit.code : -1) === 0;
}

async function writeCliScript(scriptPath: string) {
  const storage = getCliStorage();
  storage.write(cliScriptRelativePath, getLegendDiffCliScript(), { format: "text" });
  const result = await runCommand({
    args: ["755", scriptPath],
    target: { type: "executable", path: "/bin/chmod" },
    timeoutMs: 1000,
  });
  if ((result.exit.type === "exited" ? result.exit.code : -1) !== 0) {
    throw new Error(decodeProcessText(result.stderr) || `Unable to mark ${cliCommandName} as executable.`);
  }
}

async function installProfileBlock(profilePath: string, scriptPath: string) {
  const result = await runCommand({
    args: ["-s", profilePath],
    target: { type: "executable", path: "/bin/sh" },
    input: `${managedBlockStart}
${managedBlockEnd}
profile_path="$1"
block=$(cat <<'LEGEND_DIFF_CLI_BLOCK'
${createLegendDiffCliProfileBlock(scriptPath)}
LEGEND_DIFF_CLI_BLOCK
)
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
  if ((result.exit.type === "exited" ? result.exit.code : -1) !== 0) {
    throw new Error(decodeProcessText(result.stderr) || `Unable to update ${profilePath}.`);
  }
}

async function removeProfileBlock(profilePath: string) {
  const result = await runCommand({
    args: ["-s", profilePath],
    target: { type: "executable", path: "/bin/sh" },
    input: `${managedBlockStart}
${managedBlockEnd}
profile_path="$1"
if [ ! -f "$profile_path" ]; then
  exit 0
fi
tmp_file="$(mktemp)"
sed '/^${managedBlockStart}$/,/^${managedBlockEnd}$/d' "$profile_path" > "$tmp_file"
cat "$tmp_file" > "$profile_path"
rm -f "$tmp_file"
`,
    timeoutMs: 3000,
  });
  if ((result.exit.type === "exited" ? result.exit.code : -1) !== 0) {
    throw new Error(decodeProcessText(result.stderr) || `Unable to update ${profilePath}.`);
  }
}

function deleteCliScript() {
  getCliStorage().delete(cliScriptRelativePath);
}

export async function getDiffCliInstallStatus(): Promise<DiffCliInstallStatus> {
  const scriptPath = getLegendDiffCliScriptPath();
  const { home, shell } = await getShellEnvironment();
  const appPath = await getInstalledAppPath(home);
  const profilePath = getProfilePathForShell(shell, home);
  const profileContent = profilePath ? await readProfile(profilePath) : "";
  const scriptInstalled = getCliStorage().read(cliScriptRelativePath, { format: "text" }) === getLegendDiffCliScript();
  const scriptExecutable = await isExecutable(scriptPath);
  const profileInstalled = profilePath ? profileIncludesLegendDiffCliBlock(profileContent, scriptPath) : false;
  return {
    appInstalled: Boolean(appPath),
    appPath,
    installed: Boolean(appPath) && scriptInstalled && scriptExecutable && profileInstalled,
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

export async function uninstallDiffCli() {
  const { home, shell } = await getShellEnvironment();
  const profilePath = getProfilePathForShell(shell, home);
  if (!profilePath) {
    throw new Error("Could not find a supported shell profile for zsh or bash.");
  }
  deleteCliScript();
  await removeProfileBlock(profilePath);
  return getDiffCliInstallStatus();
}
