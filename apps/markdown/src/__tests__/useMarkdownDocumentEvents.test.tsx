import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { addAppExitListener, completeAppExit } from "@legend-apps/app-exit";
import { newMarkdownDocumentLaunchArgument } from "../markdownFiles";
import {
  getLastMarkdownDocumentPath,
  getMarkdownStartupBehaviorSetting,
} from "../markdownSettings";
import { useMarkdownAppExit, useMarkdownStartupDocument } from "../useMarkdownDocumentEvents";

const mockAddAppExitListener = addAppExitListener as jest.MockedFunction<typeof addAppExitListener>;
const mockCompleteAppExit = completeAppExit as jest.MockedFunction<typeof completeAppExit>;
const mockGetLastMarkdownDocumentPath = getLastMarkdownDocumentPath as jest.MockedFunction<typeof getLastMarkdownDocumentPath>;
const mockGetMarkdownStartupBehaviorSetting = getMarkdownStartupBehaviorSetting as jest.MockedFunction<typeof getMarkdownStartupBehaviorSetting>;

jest.mock("@legend-apps/app-exit", () => ({
  addAppExitListener: jest.fn(),
  completeAppExit: jest.fn(),
}));

jest.mock("@legend-apps/recent-documents", () => ({
  addRecentDocumentOpenListener: jest.fn(),
}));

jest.mock("@legend-apps/window-manager", () => ({
  addWindowCloseRequestedListener: jest.fn(),
}));

jest.mock("../appMetadata", () => ({
  getRecentMarkdownFiles: jest.fn(() => []),
}));

jest.mock("../markdownSettings", () => ({
  getLastMarkdownDocumentPath: jest.fn(),
  getMarkdownStartupBehaviorSetting: jest.fn(),
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

function StartupHarness({
  launchArguments,
  openSelectedFile,
  openUntitledDocument,
}: {
  launchArguments?: string[];
  openSelectedFile: (path: string) => void;
  openUntitledDocument: () => void;
}) {
  useMarkdownStartupDocument({
    launchArguments,
    openSelectedFile,
    openUntitledDocument,
  });

  return null;
}

describe("useMarkdownAppExit", () => {
  beforeEach(() => {
    mockAddAppExitListener.mockReset();
    mockCompleteAppExit.mockReset();
    mockAddAppExitListener.mockReturnValue({ remove: jest.fn() });
    mockGetLastMarkdownDocumentPath.mockReturnValue(null);
    mockGetMarkdownStartupBehaviorSetting.mockReturnValue("newDocument");
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

  it("opens an untitled document when the new-document launch hint is present", async () => {
    const openSelectedFile = jest.fn();
    const openUntitledDocument = jest.fn();
    mockGetMarkdownStartupBehaviorSetting.mockReturnValue("lastDocument");
    mockGetLastMarkdownDocumentPath.mockReturnValue("/tmp/recent.md");

    render(
      <StartupHarness
        launchArguments={[newMarkdownDocumentLaunchArgument]}
        openSelectedFile={openSelectedFile}
        openUntitledDocument={openUntitledDocument}
      />,
    );

    await waitFor(() => {
      expect(openUntitledDocument).toHaveBeenCalledTimes(1);
    });
    expect(openSelectedFile).not.toHaveBeenCalled();
  });
});
