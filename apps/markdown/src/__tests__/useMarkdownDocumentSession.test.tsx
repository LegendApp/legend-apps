import { render, waitFor } from "@testing-library/react-native";
import React, { useEffect, useRef } from "react";
import { Text } from "react-native";
import { useValue } from "@legendapp/state/react";
import { openFileDialog } from "@legend-desktop/file-dialog";
import { markdownFileTypes } from "../appConstants";
import { useMarkdownDocumentSession, type MarkdownDocumentSessionState$ } from "../useMarkdownDocumentSession";

const mockOpenFileDialog = openFileDialog as jest.MockedFunction<typeof openFileDialog>;

jest.mock("@legend-desktop/file-dialog", () => ({
  openFileDialog: jest.fn(),
  saveFileDialog: jest.fn(),
}));

jest.mock("@legend-desktop/markdown-document", () => ({
  nativeMarkdownDocumentAdapter: {},
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

describe("useMarkdownDocumentSession", () => {
  beforeEach(() => {
    mockOpenFileDialog.mockReset();
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
});
