import { act, render, waitFor } from "@testing-library/react-native";
import React, { useEffect, useRef } from "react";
import { Text } from "react-native";
import { useValue } from "@legendapp/state/react";
import { openFileDialog } from "@legend-desktop/file-dialog";
import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import { markdownFileTypes } from "../appConstants";
import { confirmDirtyDocumentTransition } from "../confirmDirtyDocumentTransition";
import { useMarkdownDocumentSession, type MarkdownDocumentSessionState$ } from "../useMarkdownDocumentSession";

const mockOpenFileDialog = openFileDialog as jest.MockedFunction<typeof openFileDialog>;
const mockConfirmDirtyDocumentTransition = confirmDirtyDocumentTransition as jest.MockedFunction<typeof confirmDirtyDocumentTransition>;

jest.mock("@legend-desktop/file-dialog", () => ({
  openFileDialog: jest.fn(),
  saveFileDialog: jest.fn(),
}));

jest.mock("@legend-desktop/markdown-document", () => ({
  nativeMarkdownDocumentAdapter: {},
}));

jest.mock("../confirmDirtyDocumentTransition", () => ({
  confirmDirtyDocumentTransition: jest.fn(),
}));

jest.mock("@legend-desktop/recent-documents", () => ({
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
});
