import { pathExists } from "@legend-apps/storage";
import { createMarkdownDraft, isMarkdownDraft, removeMarkdownDraft } from "../markdownDrafts";
import { markdownStorage } from "../markdownStorage";

const mockFiles = new Set<string>();
const draftDirectory = "/app data/Drafts";

jest.mock("@legend-apps/storage", () => ({
  pathExists: jest.fn((path: string) => mockFiles.has(path.slice("/app data/".length))),
}));

jest.mock("../markdownStorage", () => ({
  markdownStorage: {
    directory: () => ({ uri: "file:///app%20data/Drafts/" }),
    ensureDirectory: jest.fn(),
    list: () => [...mockFiles].map(path => ({ name: path.slice("Drafts/".length) })),
    file: (path: string) => ({ uri: `file:///app%20data/${encodeURI(path)}` }),
    delete: jest.fn((path: string) => mockFiles.delete(path)),
    write: jest.fn((path: string) => { mockFiles.add(path); }),
  },
}));

beforeEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
});

it("creates separate numbered files and removes only the selected draft", () => {
  const first = createMarkdownDraft();
  const second = createMarkdownDraft();

  expect(first).toBe(`${draftDirectory}/Untitled.md`);
  expect(second).toBe(`${draftDirectory}/Untitled 2.md`);
  expect(isMarkdownDraft(first)).toBe(true);
  expect(isMarkdownDraft(`${draftDirectory}-other/Untitled.md`)).toBe(false);
  expect(isMarkdownDraft(`${draftDirectory}/nested/Untitled.md`)).toBe(false);
  expect(markdownStorage.write).toHaveBeenCalledWith("Drafts/Untitled.md", "", { format: "text" });

  removeMarkdownDraft(`/notes/Untitled.md`);
  removeMarkdownDraft(second);
  expect(markdownStorage.delete).toHaveBeenCalledTimes(1);
  expect(mockFiles).toEqual(new Set(["Drafts/Untitled.md"]));
});

it("reports a failed write without touching other drafts", () => {
  createMarkdownDraft();
  jest.mocked(markdownStorage.write).mockImplementationOnce(() => { throw new Error("Disk full"); });

  expect(createMarkdownDraft).toThrow("Disk full");
  expect(markdownStorage.write).toHaveBeenLastCalledWith("Drafts/Untitled 2.md", "", { format: "text" });
  expect(mockFiles).toEqual(new Set(["Drafts/Untitled.md"]));
});

it("reports a draft that could not be removed", () => {
  const path = createMarkdownDraft();
  jest.mocked(markdownStorage.delete).mockImplementationOnce(() => {});
  expect(() => removeMarkdownDraft(path)).toThrow("Could not remove");
  expect(pathExists).toHaveBeenCalledWith(path);
});
