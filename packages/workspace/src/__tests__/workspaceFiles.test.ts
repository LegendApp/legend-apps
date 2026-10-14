import { openFileDialog } from "@legendapp/spark/dialogs";
import { readText, writeText } from "@legendapp/spark/files";
import { chooseWorkspace, parseWorkspaceSettings, writeWorkspace } from "../workspaceFiles";

jest.mock("@legendapp/spark/files", () => ({
  getDirectory: jest.fn(async () => "/data/app/"),
  list: jest.fn(async () => [{ name: "repo.json", path: "/data/app/Workspaces/repo.json" }]),
  mkdir: jest.fn(async () => {}),
  readText: jest.fn(),
  writeText: jest.fn(async () => {}),
}));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn() }));

describe("workspace files", () => {
  it("keeps valid folders and future settings keys", () => {
    expect(parseWorkspaceSettings('{"folders":["/a",3,"relative"],"theme":"dark"}')).toEqual({ folders: ["/a"], theme: "dark" });
    expect(parseWorkspaceSettings("{}")).toEqual({ folders: [] });
    expect(() => parseWorkspaceSettings("[]")).toThrow("JSON object");
  });

  it("names new workspaces after their first folder without overwriting", async () => {
    const path = await writeWorkspace({ folders: ["/src/repo", "/src/other"] });
    expect(path).toBe("/data/app/Workspaces/repo 2.json");
    expect(writeText).toHaveBeenCalledWith(path, '{\n  "folders": [\n    "/src/repo",\n    "/src/other"\n  ]\n}\n');
  });

  it("rewrites an existing workspace in place", async () => {
    await expect(writeWorkspace({ folders: [] }, "/data/app/Workspaces/w.json")).resolves.toBe("/data/app/Workspaces/w.json");
  });

  it("opens saved workspaces from the app data folder", async () => {
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: true });
    await expect(chooseWorkspace()).resolves.toBeNull();
    expect(openFileDialog).toHaveBeenCalledWith({ defaultPath: "/data/app/Workspaces", filters: [{ extensions: ["json"] }], selection: "files" });

    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/data/app/Workspaces/w.json"] });
    jest.mocked(readText).mockResolvedValueOnce('{"folders":["/a","/b"]}');
    await expect(chooseWorkspace()).resolves.toEqual({ folders: ["/a", "/b"], workspacePath: "/data/app/Workspaces/w.json" });
  });
});
