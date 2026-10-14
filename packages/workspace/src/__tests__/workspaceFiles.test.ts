import { writeText } from "@legendapp/spark/files";
import { getWorkspaceName, parseWorkspaceSettings, writeWorkspace } from "../workspaceFiles";

jest.mock("@legendapp/spark/files", () => ({
  getDirectory: jest.fn(async () => "/data/app/"),
  list: jest.fn(async () => [{ name: "repo.json", path: "/data/app/Workspaces/repo.json" }]),
  mkdir: jest.fn(async () => {}),
  readText: jest.fn(),
  writeText: jest.fn(async () => {}),
}));

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
    expect(getWorkspaceName(path)).toBe("repo 2");
  });

  it("rewrites an existing workspace in place", async () => {
    await expect(writeWorkspace({ folders: [] }, "/data/app/Workspaces/w.json")).resolves.toBe("/data/app/Workspaces/w.json");
  });
});
