import { nativeMarkdownDocumentAdapter } from "@legend-apps/markdown-document";
import { untitledMarkdownAdapter } from "../untitledMarkdownAdapter";

jest.mock("@legend-apps/markdown-document", () => ({
  nativeMarkdownDocumentAdapter: {
    loadMarkdown: jest.fn(async () => ({ documentId: "untitled" })),
    getBlockSync: jest.fn(),
    getBlockIdAtIndexSync: jest.fn(),
    getBlockIndexForIdSync: jest.fn(),
    save: jest.fn(),
    saveAs: jest.fn(),
  },
}));

it("retains native indexed access for rows inserted before the first save", () => {
  expect(untitledMarkdownAdapter.getBlockSync).toBe(nativeMarkdownDocumentAdapter.getBlockSync);
  expect(untitledMarkdownAdapter.getBlockIdAtIndexSync).toBe(nativeMarkdownDocumentAdapter.getBlockIdAtIndexSync);
  expect(untitledMarkdownAdapter.getBlockIndexForIdSync).toBe(nativeMarkdownDocumentAdapter.getBlockIndexForIdSync);
});

it("creates an empty document and keeps ordinary save disabled until Save As", async () => {
  await untitledMarkdownAdapter.load("Untitled.md");
  expect(nativeMarkdownDocumentAdapter.loadMarkdown).toHaveBeenCalledWith("Untitled.md", "");
  await untitledMarkdownAdapter.save("untitled");
  expect(nativeMarkdownDocumentAdapter.save).not.toHaveBeenCalled();
  await untitledMarkdownAdapter.saveAs("untitled", "/tmp/note.md");
  expect(nativeMarkdownDocumentAdapter.saveAs).toHaveBeenCalledWith("untitled", "/tmp/note.md");
});
