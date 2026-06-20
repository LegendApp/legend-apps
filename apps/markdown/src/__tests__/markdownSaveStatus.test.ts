import { markdownSaveStatusText } from "../markdownSaveStatus";

describe("markdownSaveStatusText", () => {
  it("shows autosave progress for dirty file-backed documents", () => {
    expect(markdownSaveStatusText({
      autosaveEnabled: true,
      isDirty: true,
      isUntitledDocument: false,
      saveState: "saving",
    })).toBe("Autosaving...");
  });

  it("shows unsaved changes before the save starts", () => {
    expect(markdownSaveStatusText({
      autosaveEnabled: true,
      isDirty: true,
      isUntitledDocument: false,
      saveState: "idle",
    })).toBe("Unsaved changes");
  });

  it("shows saved only for clean file-backed documents", () => {
    expect(markdownSaveStatusText({
      autosaveEnabled: true,
      isDirty: false,
      isUntitledDocument: false,
      saveState: "idle",
    })).toBe("Saved");
    expect(markdownSaveStatusText({
      autosaveEnabled: true,
      isDirty: false,
      isUntitledDocument: true,
      saveState: "idle",
    })).toBeNull();
  });

  it("shows save failures", () => {
    expect(markdownSaveStatusText({
      autosaveEnabled: false,
      isDirty: true,
      isUntitledDocument: false,
      saveState: "error",
    })).toBe("Save failed");
  });
});
