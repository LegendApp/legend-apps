import { act, render, waitFor } from "@testing-library/react-native";
import React, { useEffect, useRef } from "react";
import { Text } from "react-native";
import { useValue } from "@legendapp/state/react";
import { openFileDialog, saveFileDialog } from "@legend-apps/file-dialog";
import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import { markdownFileTypes } from "../appConstants";
import { confirmDirtyDocumentTransition } from "../confirmDirtyDocumentTransition";
import { useMarkdownDocumentSession, type MarkdownDocumentSessionState$ } from "../useMarkdownDocumentSession";

const mockOpenFileDialog = openFileDialog as jest.MockedFunction<typeof openFileDialog>;
const mockConfirmDirtyDocumentTransition = confirmDirtyDocumentTransition as jest.MockedFunction<typeof confirmDirtyDocumentTransition>;

jest.mock("@legend-apps/file-dialog", () => ({
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

jest.mock("@legend-apps/recent-documents", () => ({
  noteRecentDocument: jest.fn(),
}));

function SessionHarness({ onState }: { onState: (state$: MarkdownDocumentSessionState$) => void }) {
  const session = useMarkdownDocumentSession();
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

function SessionApiHarness({ onSession }: { onSession: (session: MarkdownDocumentSession) => void }) {
  const session = useMarkdownDocumentSession();

  useEffect(() => {
    onSession(session);
  }, [onSession, session]);

  return null;
}

describe("useMarkdownDocumentSession", () => {
  beforeEach(() => {
    mockOpenFileDialog.mockReset();
    mockConfirmDirtyDocumentTransition.mockReset();
  });

  it("filters the open dialog to Markdown files", async () => {
    mockOpenFileDialog.mockResolvedValue(null);

    await render(<SessionHarness onState={() => undefined} />);

    await waitFor(() => {
      expect(mockOpenFileDialog).toHaveBeenCalledWith({
        allowedFileTypes: markdownFileTypes,
        canChooseFiles: true,
      });
    });
  });

  it("reports unsupported files if the dialog returns a non-Markdown path", async () => {
    let state$: MarkdownDocumentSessionState$ | undefined;
    mockOpenFileDialog.mockResolvedValue(["/tmp/notes.txt"]);

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
    dialog.mockResolvedValueOnce(null).mockResolvedValueOnce("/tmp/notes.md");
    expect(await session.saveCurrentDocumentAs(true)).toBe(false);
    expect(await session.saveCurrentDocumentAs(true)).toBe(false);
    expect(saveAs).not.toHaveBeenCalled();
    expect(session.sessionState$.conflict.peek()).toBe("changed");
    expect(session.sessionState$.isDirty.peek()).toBe(true);
    dialog.mockResolvedValueOnce("/tmp/notes copy.md");
    expect(await session.saveCurrentDocumentAs(true)).toBe(true);
    expect(saveAs).toHaveBeenCalledWith("/tmp/notes copy.md");
    expect(session.sessionState$.filename.peek()).toBe("/tmp/notes copy.md");
    expect(session.sessionState$.conflict.peek()).toBeNull();
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
    let resolveDialog!: (path: string) => void;
    const view = await render(<SessionApiHarness onSession={(value) => { session = value; }} />);
    const saveAs = jest.fn(async () => {});
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    session.sessionState$.filename.set("/tmp/notes.md");
    (saveFileDialog as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveDialog = resolve; }));
    const save = session.saveCurrentDocumentAs(true);
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    resolveDialog("/tmp/copy.md");
    expect(await save).toBe(true);
    expect(saveAs).toHaveBeenCalledWith("/tmp/copy.md");
    await view.unmount();
  });

  it("does not save a newly opened document into a stale Save As dialog's destination", async () => {
    let session!: MarkdownDocumentSession;
    let resolveDialog!: (path: string) => void;
    const view = await render(<SessionApiHarness onSession={(value) => { session = value; }} />);
    const saveAs = jest.fn(async () => {});
    session.documentCommandsRef.current = { saveAs } as unknown as MarkdownDocumentCommands;
    session.sessionState$.filename.set("/tmp/first.md");
    (saveFileDialog as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveDialog = resolve; }));
    const save = session.saveCurrentDocumentAs(true);
    session.sessionState$.filename.set("/tmp/second.md");
    resolveDialog("/tmp/copy.md");
    expect(await save).toBe(false);
    expect(saveAs).not.toHaveBeenCalled();
    await view.unmount();
  });

});
