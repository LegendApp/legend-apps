import { act, render, waitFor } from "@testing-library/react-native";
import React, { useEffect, useRef } from "react";
import { Text } from "react-native";
import { useValue } from "@legendapp/state/react";
import { openFileDialog, saveFileDialog } from "@legendapp/spark/dialogs";
import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import { markdownFileTypes } from "../appConstants";
import { removeMarkdownDraft } from "../markdownDrafts";
import { noteRecentDocument } from "@legendapp/spark/app/documents";
import { confirmDirtyDocumentTransition } from "../confirmDirtyDocumentTransition";
import { useMarkdownDocumentSession, type MarkdownDocumentSessionOptions, type MarkdownDocumentSessionState$ } from "../useMarkdownDocumentSession";

const mockOpenFileDialog = openFileDialog as jest.MockedFunction<typeof openFileDialog>;
const mockConfirmDirtyDocumentTransition = confirmDirtyDocumentTransition as jest.MockedFunction<typeof confirmDirtyDocumentTransition>;

jest.mock("@legendapp/spark/dialogs", () => ({
  openFileDialog: jest.fn(),
  saveFileDialog: jest.fn(),
}));

jest.mock("@legend-apps/markdown-document", () => ({
  nativeMarkdownDocumentAdapter: {},
  isMarkdownFileConflictError: (error: unknown) => String(error).includes("MARKDOWN_FILE_CONFLICT:"),
}));

jest.mock("../confirmDirtyDocumentTransition", () => ({
  confirmDirtyDocumentTransition: jest.fn(),
}));

jest.mock("@legendapp/spark/app/documents", () => ({
  ...jest.requireActual("@legendapp/spark/app/documents"),
  noteRecentDocument: jest.fn(),
}));

jest.mock("../markdownDrafts", () => ({
  isMarkdownDraft: (path: string) => path.startsWith("/test-drafts/"),
  removeMarkdownDraft: jest.fn(),
}));

const defaultOptions = { onOpenFile: jest.fn(), onFileSavedAs: jest.fn(), windowId: "markdown-editor" };

function SessionHarness({ onState }: { onState: (state$: MarkdownDocumentSessionState$) => void }) {
  const session = useMarkdownDocumentSession(defaultOptions);
  const lastError = useValue(session.sessionState$.lastError);
  const didOpenRef = useRef(false);

  useEffect(() => {
    if (!didOpenRef.current) {
      didOpenRef.current = true;
      onState(session.sessionState$);
      void session.openMarkdownDialog();
    }
  }, [onState, session]);

  return <Text>{lastError}</Text>;
}

type MarkdownDocumentSession = ReturnType<typeof useMarkdownDocumentSession>;

function SessionApiHarness({ onSession, options }: { onSession: (session: MarkdownDocumentSession) => void; options?: MarkdownDocumentSessionOptions }) {
  const session = useMarkdownDocumentSession(options ?? defaultOptions);

  useEffect(() => {
    onSession(session);
  }, [onSession, session]);

  return null;
}

describe("useMarkdownDocumentSession", () => {
  beforeEach(() => {
    mockOpenFileDialog.mockReset();
    (saveFileDialog as jest.Mock).mockReset();
    mockConfirmDirtyDocumentTransition.mockReset();
    jest.mocked(removeMarkdownDraft).mockClear();
    jest.mocked(noteRecentDocument).mockClear();
    defaultOptions.onOpenFile.mockClear();
  });

  it("filters the open dialog to Markdown files and attaches it to its window", async () => {
    mockOpenFileDialog.mockResolvedValue({ canceled: true });

    await render(<SessionHarness onState={() => undefined} />);

    await waitFor(() => {
      expect(mockOpenFileDialog).toHaveBeenCalledWith({
        filters: [{ extensions: markdownFileTypes }],
        selection: "files",
        windowId: "markdown-editor",
      });
    });
  });

  it("reports unsupported files if the dialog returns a non-Markdown path", async () => {
    let state$: MarkdownDocumentSessionState$ | undefined;
    mockOpenFileDialog.mockResolvedValue({ canceled: false, paths: ["/tmp/notes.txt"] });

    const view = await render(<SessionHarness onState={(nextState$) => {
      state$ = nextState$;
    }} />);

    await view.findByText("Choose a Markdown file (.md, .markdown, .mdown, .mkd, .mdx).");
    expect(state$?.lastError.peek()).toBe("Choose a Markdown file (.md, .markdown, .mdown, .mkd, .mdx).");
  });

  it("autosaves a dirty file-backed document before quit without prompting", async () => {
    let session: MarkdownDocumentSession | undefined;
    const save = jest.fn(async () => undefined);
    render(<SessionApiHarness onSession={(nextSession) => {
      session = nextSession;
    }} />);

    await waitFor(() => {
      expect(session).toBeDefined();
    });
    session!.documentCommandsRef.current = { save } as unknown as MarkdownDocumentCommands;
    await act(async () => {
      session!.sessionState$.assign({
        documentSource: "file",
        filename: "/tmp/notes.md",
        isDirty: true,
      });
    });

    await expect(session!.prepareCurrentDocumentForClose({
      autosaveEnabled: true,
      reason: "quit",
    })).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(mockConfirmDirtyDocumentTransition).not.toHaveBeenCalled();
  });

  it("prompts before quitting a dirty document when autosave is disabled", async () => {
    let session: MarkdownDocumentSession | undefined;
    const save = jest.fn(async () => undefined);
    mockConfirmDirtyDocumentTransition.mockResolvedValue("save");
    render(<SessionApiHarness onSession={(nextSession) => {
      session = nextSession;
    }} />);

    await waitFor(() => {
      expect(session).toBeDefined();
    });
    session!.documentCommandsRef.current = { save } as unknown as MarkdownDocumentCommands;
    await act(async () => {
      session!.sessionState$.assign({
        documentSource: "file",
        filename: "/tmp/notes.md",
        isDirty: true,
      });
    });

    await expect(session!.prepareCurrentDocumentForClose({
      autosaveEnabled: false,
      reason: "quit",
    })).resolves.toBe(true);
    expect(mockConfirmDirtyDocumentTransition).toHaveBeenCalledWith({
      filename: "notes.md",
      reason: "quit",
    });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it("keeps the session and conflict when Save local separately is canceled or uses the original path", async () => {
    let session!: MarkdownDocumentSession;
    const saveAs = jest.fn(async () => {});
    const view = await render(<SessionApiHarness onSession={(value) => { session = value; }} />);
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    session.sessionState$.assign({ documentSource: "file", filename: "/tmp/notes.md", isDirty: true, conflict: "changed" });
    const dialog = saveFileDialog as jest.MockedFunction<typeof saveFileDialog>;
    dialog.mockResolvedValueOnce({ canceled: true }).mockResolvedValueOnce({ canceled: false, path: "/tmp/notes.md" });
    expect(await session.saveCurrentDocumentAs(true)).toBe(false);
    expect(await session.saveCurrentDocumentAs(true)).toBe(false);
    expect(saveAs).not.toHaveBeenCalled();
    expect(session.sessionState$.conflict.peek()).toBe("changed");
    expect(session.sessionState$.isDirty.peek()).toBe(true);
    dialog.mockResolvedValueOnce({ canceled: false, path: "/tmp/notes copy.md" });
    expect(await session.saveCurrentDocumentAs(true)).toBe(true);
    expect(saveAs).toHaveBeenCalledWith("/tmp/notes copy.md", true);
    expect(session.sessionState$.filename.peek()).toBe("/tmp/notes copy.md");
    expect(session.sessionState$.conflict.peek()).toBeNull();
    await view.unmount();
  });

  it("reports opened files and Save As renames so window tabs can follow", async () => {
    let session!: MarkdownDocumentSession;
    const options = { ...defaultOptions, onOpenFile: jest.fn(), onFileSavedAs: jest.fn() };
    const saveAs = jest.fn(async () => {});
    const view = await render(<SessionApiHarness onSession={(value) => { session = value; }} options={options} />);
    mockOpenFileDialog.mockResolvedValueOnce({ canceled: false, paths: ["/tmp/notes.md"] });
    await act(async () => session.openMarkdownDialog());
    expect(options.onOpenFile).toHaveBeenCalledWith("/tmp/notes.md");
    await act(async () => session.openSelectedFile("/tmp/notes.md"));
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    (saveFileDialog as jest.Mock).mockResolvedValueOnce({ canceled: false, path: "/tmp/renamed.md" });
    await act(async () => { await session.saveCurrentDocumentAs(); });
    expect(options.onFileSavedAs).toHaveBeenCalledWith("/tmp/notes.md", "/tmp/renamed.md");
    await view.unmount();
  });

  it("prompts before closing a deleted clean document instead of losing its only remaining buffer", async () => {
    let session!: MarkdownDocumentSession;
    const view = await render(<SessionApiHarness onSession={(value) => { session = value; }} />);
    session.sessionState$.assign({ documentSource: "file", filename: "/tmp/notes.md", isDirty: false, conflict: "missing" });
    mockConfirmDirtyDocumentTransition.mockResolvedValue("cancel");
    expect(await session.prepareCurrentDocumentForClose({ autosaveEnabled: true })).toBe(false);
    expect(mockConfirmDirtyDocumentTransition).toHaveBeenCalled();
    await view.unmount();
  });

  it("allows editor commands to refresh while the Save As dialog is open", async () => {
    let session!: MarkdownDocumentSession;
    let resolveDialog!: (result: import("@legendapp/spark/dialogs").SaveFileDialogResult) => void;
    const view = await render(<SessionApiHarness onSession={(value) => { session = value; }} />);
    const saveAs = jest.fn(async () => {});
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    session.sessionState$.filename.set("/tmp/notes.md");
    (saveFileDialog as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveDialog = resolve; }));
    const save = session.saveCurrentDocumentAs(true);
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    resolveDialog({ canceled: false, path: "/tmp/copy.md" });
    expect(await save).toBe(true);
    expect(saveAs).toHaveBeenCalledWith("/tmp/copy.md", true);
    await view.unmount();
  });

  it("does not save a newly opened document into a stale Save As dialog's destination", async () => {
    let session!: MarkdownDocumentSession;
    let resolveDialog!: (result: import("@legendapp/spark/dialogs").SaveFileDialogResult) => void;
    const view = await render(<SessionApiHarness onSession={(value) => { session = value; }} />);
    const saveAs = jest.fn(async () => {});
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    session.sessionState$.filename.set("/tmp/first.md");
    (saveFileDialog as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveDialog = resolve; }));
    const save = session.saveCurrentDocumentAs(true);
    session.sessionState$.filename.set("/tmp/second.md");
    resolveDialog({ canceled: false, path: "/tmp/copy.md" });
    expect(await save).toBe(false);
    expect(saveAs).not.toHaveBeenCalled();
    await view.unmount();
  });

  it.each([false, true])("ignores a stale Save As write completion (failure=%s)", async (fail) => {
    let session!: MarkdownDocumentSession;
    let finish!: () => void;
    const view = await render(<SessionApiHarness onSession={(value) => { session = value; }} />);
    session.openSelectedFile("/tmp/first.md");
    const saveAs = jest.fn(() => new Promise<void>((resolve, reject) => {
      finish = () => fail ? reject(new Error("Old write failed")) : resolve();
    }));
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    (saveFileDialog as jest.Mock).mockResolvedValue({ canceled: false, path: "/tmp/copy.md" });
    const saving = session.saveCurrentDocumentAs();
    await waitFor(() => expect(saveAs).toHaveBeenCalled());
    session.openSelectedFile("/tmp/second.md");
    session.setIsDirty(true);
    finish();
    expect(await saving).toBe(false);
    expect(session.sessionState$.filename.peek()).toBe("/tmp/second.md");
    expect(session.sessionState$.isDirty.peek()).toBe(true);
    expect(session.sessionState$.lastError.peek()).toBeNull();
    await view.unmount();
  });

  async function openSession() {
    let session!: MarkdownDocumentSession;
    await render(<SessionApiHarness onSession={(value) => { session = value; }} />);
    session.openSelectedFile("/tmp/original.md");
    session.setIsDirty(true);
    return session;
  }

  it("skips a shared close prompt only while another view survives or the group approved it", async () => {
    const session = await openSession();
    const document = {};
    const view = {};
    const other = {};
    const group = { views: new Set([view, other]), approvedDocuments: new Set<object>() };
    session.documentCommandsRef.current = {
      getCloseState: () => ({ document, view, views: group.views }),
    } as unknown as MarkdownDocumentCommands;

    const close = (options = {}) => session.prepareCurrentDocumentForClose({ autosaveEnabled: false, ...options });
    expect(await close()).toBe(true);
    expect(mockConfirmDirtyDocumentTransition).not.toHaveBeenCalled();

    mockConfirmDirtyDocumentTransition.mockResolvedValueOnce("cancel").mockResolvedValueOnce("discard");
    expect(await close({ group })).toBe(false);
    expect(group.approvedDocuments.size).toBe(0);
    expect(await close({ group })).toBe(true);
    expect(await close({ group })).toBe(true);
    expect(mockConfirmDirtyDocumentTransition).toHaveBeenCalledTimes(2);
  });

  it.each(["close", "quit"] as const)("preserves unsaved work when %s is canceled", async (transition) => {
    const session = await openSession();
    const save = jest.fn(async () => {});
    session.documentCommandsRef.current = { save } as unknown as MarkdownDocumentCommands;
    mockConfirmDirtyDocumentTransition.mockResolvedValue("cancel");
    mockOpenFileDialog.mockResolvedValue({ canceled: false, paths: ["/tmp/next.md"] });
    expect(await session.prepareCurrentDocumentForClose({ autosaveEnabled: false, reason: transition })).toBe(false);
    expect(session.sessionState$.filename.peek()).toBe("/tmp/original.md");
    expect(session.sessionState$.isDirty.peek()).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["close", "quit"] as const)("blocks %s when saving fails and allows retry", async (transition) => {
    const session = await openSession();
    const save = jest.fn().mockRejectedValueOnce(new Error("Disk full")).mockResolvedValue(undefined);
    session.documentCommandsRef.current = { save } as unknown as MarkdownDocumentCommands;
    mockConfirmDirtyDocumentTransition.mockResolvedValue("save");
    mockOpenFileDialog.mockResolvedValue({ canceled: false, paths: ["/tmp/next.md"] });
    const run = () => session.prepareCurrentDocumentForClose({ autosaveEnabled: false, reason: transition });
    await run();
    expect(session.sessionState$.filename.peek()).toBe("/tmp/original.md");
    expect(session.sessionState$.isDirty.peek()).toBe(true);
    expect(session.sessionState$.lastError.peek()).toBe("Disk full");
    const retryResult = await run();
    expect(retryResult).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it.each(["changed", "missing"] as const)("never silently autosaves over a %s conflict on close", async (conflict) => {
    const session = await openSession();
    session.setConflict(conflict);
    const save = jest.fn(async () => {});
    session.documentCommandsRef.current = { save } as unknown as MarkdownDocumentCommands;
    mockConfirmDirtyDocumentTransition.mockResolvedValue("cancel");
    expect(await session.prepareCurrentDocumentForClose({ autosaveEnabled: true })).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(session.sessionState$.conflict.peek()).toBe(conflict);
    expect(session.sessionState$.isDirty.peek()).toBe(true);
  });

  it("retains the original document after Save As fails, then completes a successful retry", async () => {
    const session = await openSession();
    const saveAs = jest.fn().mockRejectedValueOnce(new Error("Permission denied")).mockResolvedValue(undefined);
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    (saveFileDialog as jest.Mock).mockResolvedValue({ canceled: false, path: "/tmp/copy.md" });
    expect(await session.saveCurrentDocumentAs()).toBe(false);
    expect(session.sessionState$.filename.peek()).toBe("/tmp/original.md");
    expect(session.sessionState$.isDirty.peek()).toBe(true);
    expect(await session.saveCurrentDocumentAs()).toBe(true);
    expect(session.sessionState$.filename.peek()).toBe("/tmp/copy.md");
    expect(session.sessionState$.isDirty.peek()).toBe(false);
    expect(session.sessionState$.lastError.peek()).toBeNull();
  });

  it("keeps a draft on cancel and write failure, then renames and removes it after first save", async () => {
    const session = await openSession();
    const draft = "/test-drafts/Untitled.md";
    session.openSelectedFile(draft);
    session.handleDocumentLoaded();
    session.setIsDirty(true);
    const save = jest.fn();
    const saveAs = jest.fn().mockRejectedValueOnce(new Error("Disk full")).mockResolvedValueOnce(undefined);
    session.documentCommandsRef.current = { save, saveAs } as unknown as MarkdownDocumentCommands;
    jest.mocked(saveFileDialog)
      .mockResolvedValueOnce({ canceled: true })
      .mockResolvedValue({ canceled: false, path: "/tmp/new.md" });

    expect(noteRecentDocument).not.toHaveBeenCalled();
    expect(await session.saveCurrentDocument()).toBe(false);
    expect(await session.saveCurrentDocument()).toBe(false);
    expect(session.sessionState$.filename.peek()).toBe(draft);
    expect(session.sessionState$.documentSource.peek()).toBe("draft");
    expect(session.sessionState$.isDirty.peek()).toBe(true);
    expect(removeMarkdownDraft).not.toHaveBeenCalled();

    expect(await session.saveCurrentDocument()).toBe(true);
    expect(saveFileDialog).toHaveBeenCalledWith(expect.objectContaining({ defaultName: "Untitled.md", defaultPath: undefined }));
    expect(saveAs).toHaveBeenLastCalledWith("/tmp/new.md");
    expect(save).not.toHaveBeenCalled();
    expect(defaultOptions.onFileSavedAs).toHaveBeenLastCalledWith(draft, "/tmp/new.md");
    expect(removeMarkdownDraft).toHaveBeenCalledTimes(1);
    expect(removeMarkdownDraft).toHaveBeenCalledWith(draft);
    expect(noteRecentDocument).toHaveBeenCalledWith("/tmp/new.md");
  });

  it("prevents duplicate open dialogs while one is pending and recovers after a dialog error", async () => {
    const session = await openSession();
    let rejectDialog!: (error: Error) => void;
    mockOpenFileDialog.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectDialog = reject; }));
    const pending = session.openMarkdownDialog();
    await session.openMarkdownDialog();
    expect(mockOpenFileDialog).toHaveBeenCalledTimes(1);
    rejectDialog(new Error("Dialog unavailable"));
    await pending;
    expect(session.sessionState$.filename.peek()).toBe("/tmp/original.md");
    mockOpenFileDialog.mockResolvedValue({ canceled: false, paths: ["/tmp/retry.md"] });
    mockConfirmDirtyDocumentTransition.mockResolvedValue("discard");
    await session.openMarkdownDialog();
    expect(defaultOptions.onOpenFile).toHaveBeenCalledWith("/tmp/retry.md");
    expect(session.sessionState$.filename.peek()).toBe("/tmp/original.md");
  });

  it("keeps conflict state after overwrite failure and uses disk only for an existing file", async () => {
    const session = await openSession();
    session.setConflict("changed");
    const reload = jest.fn(), overwrite = jest.fn().mockRejectedValueOnce(new Error("Read only"));
    session.documentCommandsRef.current = { reload, overwrite } as unknown as MarkdownDocumentCommands;
    await session.overwriteWithLocal();
    expect(session.sessionState$.lastError.peek()).toBe("Read only");
    expect(session.sessionState$.conflict.peek()).toBe("changed");
    expect(session.sessionState$.isDirty.peek()).toBe(true);
    session.useDiskVersion();
    expect(reload).toHaveBeenCalledTimes(1);
    session.setConflict("missing");
    session.useDiskVersion();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps a file load error on its own tab until recovery", async () => {
    const session = await openSession();
    session.handleDocumentLoadError(new Error("File disappeared"));
    expect(session.sessionState$.filename.peek()).toBe("/tmp/original.md");
    expect(session.sessionState$.lastError.peek()).toBe("File disappeared");
    session.openSelectedFile("/tmp/recovered.md");
    session.handleDocumentLoaded();
    expect(session.sessionState$.lastError.peek()).toBeNull();
  });

});
