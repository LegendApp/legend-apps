import { openFileDialog } from "@legendapp/spark/dialogs";
import { getDirectory, list, mkdir, readText, writeText } from "@legendapp/spark/files";
import { getPathName } from "./fileTree";
import type { WorkspaceWindowProps } from "./workspaceState";

/** Workspace settings. Further keys can sit beside `folders`; unknown keys survive a read and write. */
export type WorkspaceSettings = { folders: string[] };

const workspaceFileExtension = "json";

export function parseWorkspaceSettings(text: string): WorkspaceSettings {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A workspace file must contain a JSON object.");
  const { folders } = value as { folders?: unknown };
  return { ...value, folders: Array.isArray(folders) ? folders.filter((folder): folder is string => typeof folder === "string" && folder.startsWith("/")) : [] };
}

/** Workspaces live in the app's data folder rather than beside the user's files. */
async function getWorkspacesDirectory() {
  const directory = `${(await getDirectory("data")).replace(/\/+$/, "")}/Workspaces`;
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function readWorkspace(path: string) {
  return parseWorkspaceSettings(await readText(path));
}

/** Writes to `path`, or to a new file named after the first folder. Returns the path written. */
export async function writeWorkspace(settings: WorkspaceSettings, path?: string) {
  const target = path ?? await getNewWorkspacePath(settings);
  await writeText(target, `${JSON.stringify(settings, null, 2)}\n`);
  return target;
}

async function getNewWorkspacePath(settings: WorkspaceSettings) {
  const directory = await getWorkspacesDirectory();
  const taken = new Set((await list(directory)).map(entry => entry.name));
  const base = settings.folders[0] ? getPathName(settings.folders[0]).replace(/[/:]/g, "-") : "Workspace";
  for (let count = 1; ; count++) {
    const name = `${count === 1 ? base : `${base} ${count}`}.${workspaceFileExtension}`;
    if (!taken.has(name)) return `${directory}/${name}`;
  }
}

export async function chooseFolders() {
  const result = await openFileDialog({ multiple: true, selection: "directories" });
  return result.canceled ? [] : result.paths;
}

/** Picks a saved workspace and returns the props to open its window with. */
export async function chooseWorkspace(): Promise<WorkspaceWindowProps | null> {
  const result = await openFileDialog({ defaultPath: await getWorkspacesDirectory(), filters: [{ extensions: [workspaceFileExtension] }], selection: "files" });
  const workspacePath = result.canceled ? undefined : result.paths[0];
  return workspacePath ? { folders: (await readWorkspace(workspacePath)).folders, workspacePath } : null;
}
