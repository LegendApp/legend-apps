import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { beforeQuit } from "@legendapp/spark/app";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { newMarkdownDocumentLaunchArgument } from "../markdownFiles";
import {
  getLastMarkdownDocumentPath,
  getMarkdownStartupBehaviorSetting,
} from "../markdownSettings";
import { useMarkdownAppExit, useMarkdownStartupDocument, useMarkdownWindowCloseRequest } from "../useMarkdownDocumentEvents";

const mockAddAppExitListener = beforeQuit as jest.MockedFunction<typeof beforeQuit>;
const mockGetLastMarkdownDocumentPath = getLastMarkdownDocumentPath as jest.MockedFunction<typeof getLastMarkdownDocumentPath>;
const mockGetMarkdownStartupBehaviorSetting = getMarkdownStartupBehaviorSetting as jest.MockedFunction<typeof getMarkdownStartupBehaviorSetting>;

jest.mock("@legendapp/spark/app", () => ({
  beforeQuit: jest.fn(),
}));

jest.mock("@legendapp/spark/app/documents", () => ({
  addRecentDocumentOpenListener: jest.fn(),
}));

jest.mock("@legendapp/spark/windows", () => ({
  beforeWindowClose: jest.fn(),
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
    mockAddAppExitListener.mockResolvedValue({ remove: jest.fn(async () => {}) });
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

    expect(await mockAddAppExitListener.mock.calls[0][0]()).toBe(true);

    await waitFor(() => {
      expect(prepareCurrentDocumentForClose).toHaveBeenCalledWith({
        autosaveEnabled: true,
        reason: "quit",
      });
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

it("keeps one window close guard while autosave and close callbacks change", async () => {
  const remove = jest.fn(async () => {});
  jest.mocked(beforeWindowClose).mockResolvedValue({ remove });
  const first = jest.fn(async () => true), second = jest.fn(async () => false);
  const handleError = jest.fn();
  function CloseHarness({ autosaveEnabled, prepare }: { autosaveEnabled: boolean; prepare: typeof first }) {
    useMarkdownWindowCloseRequest({ autosaveEnabled, handleError, prepareCurrentDocumentForClose: prepare, windowId: "markdown-editor" });
    return null;
  }
  const view = await render(<CloseHarness autosaveEnabled={false} prepare={first} />);
  await view.rerender(<CloseHarness autosaveEnabled prepare={second} />);
  expect(beforeWindowClose).toHaveBeenCalledTimes(1);
  expect(await jest.mocked(beforeWindowClose).mock.calls[0][1]()).toBe(false);
  expect(second).toHaveBeenCalledWith({ autosaveEnabled: true, reason: "close" });
  expect(first).not.toHaveBeenCalled();
  await view.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
