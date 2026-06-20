import { markdownEditorWindowTitle } from "../markdownWindowTitle";

describe("markdownEditorWindowTitle", () => {
  it("reserves trailing indicator spacing for clean saved file-backed documents", () => {
    expect(markdownEditorWindowTitle({
      filename: "/tmp/notes.md",
      isDirty: false,
      isUntitledDocument: false,
      saveState: "idle",
    })).toBe("notes.md  ");
  });

  it("shows a small trailing bullet for unsaved file-backed documents", () => {
    expect(markdownEditorWindowTitle({
      filename: "/tmp/notes.md",
      isDirty: true,
      isUntitledDocument: false,
      saveState: "idle",
    })).toBe("notes.md •");
  });

  it("shows the small trailing bullet while saving or failed", () => {
    expect(markdownEditorWindowTitle({
      filename: "/tmp/notes.md",
      isDirty: false,
      isUntitledDocument: false,
      saveState: "saving",
    })).toBe("notes.md •");
    expect(markdownEditorWindowTitle({
      filename: "/tmp/notes.md",
      isDirty: false,
      isUntitledDocument: false,
      saveState: "error",
    })).toBe("notes.md •");
  });

  it("does not reserve indicator spacing for clean untitled documents", () => {
    expect(markdownEditorWindowTitle({
      filename: "Untitled.md",
      isDirty: false,
      isUntitledDocument: true,
      saveState: "idle",
    })).toBe("Untitled");
  });
});
