import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { addAppExitListener, completeAppExit } from "@legend-desktop/app-exit";
import { useMarkdownAppExit } from "../useMarkdownDocumentEvents";

const mockAddAppExitListener = addAppExitListener as jest.MockedFunction<typeof addAppExitListener>;
const mockCompleteAppExit = completeAppExit as jest.MockedFunction<typeof completeAppExit>;

jest.mock("@legend-desktop/app-exit", () => ({
  addAppExitListener: jest.fn(),
  completeAppExit: jest.fn(),
}));

jest.mock("@legend-desktop/recent-documents", () => ({
  addRecentDocumentOpenListener: jest.fn(),
}));

jest.mock("@legend-desktop/window-manager", () => ({
  addWindowCloseRequestedListener: jest.fn(),
}));

jest.mock("../appMetadata", () => ({
  getRecentMarkdownFiles: jest.fn(() => []),
}));

jest.mock("../markdownSettings", () => ({
  getLastMarkdownDocumentPath: jest.fn(() => null),
  getMarkdownStartupBehaviorSetting: jest.fn(() => "newDocument"),
}));

jest.mock("../markdownWindows", () => ({
  closeMarkdownEditorWindow: jest.fn(),
}));

function AppExitHarness({
  autosaveEnabled,
  handleError,
  prepareCurrentDocumentForClose,
}: {
  autosaveEnabled: boolean;
  handleError: (error: unknown) => void;
  prepareCurrentDocumentForClose: (options: { autosaveEnabled: boolean; reason?: "close" | "quit" }) => Promise<boolean>;
}) {
  useMarkdownAppExit({
    autosaveEnabled,
    handleError,
    prepareCurrentDocumentForClose,
  });

  return null;
}

describe("useMarkdownAppExit", () => {
  beforeEach(() => {
    mockAddAppExitListener.mockReset();
    mockCompleteAppExit.mockReset();
    mockAddAppExitListener.mockReturnValue({ remove: jest.fn() });
  });

  it("prepares the document for quit before completing a requested app exit", async () => {
    const handleError = jest.fn();
    const prepareCurrentDocumentForClose = jest.fn(async () => true);
    await render(
      <AppExitHarness
        autosaveEnabled
        handleError={handleError}
        prepareCurrentDocumentForClose={prepareCurrentDocumentForClose}
      />,
    );

    mockAddAppExitListener.mock.calls[0][0]({ reason: "requested" });

    await waitFor(() => {
      expect(prepareCurrentDocumentForClose).toHaveBeenCalledWith({
        autosaveEnabled: true,
        reason: "quit",
      });
      expect(mockCompleteAppExit).toHaveBeenCalledWith(true);
    });
    expect(handleError).not.toHaveBeenCalled();
  });
});
