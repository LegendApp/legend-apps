import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { beforeQuit } from "@legendapp/spark/app";
import { newMarkdownDocumentLaunchArgument } from "../markdownFiles";
import {
  getLastMarkdownDocumentPath,
  getMarkdownStartupBehaviorSetting,
} from "../markdownSettings";
import { useMarkdownAppExit, useMarkdownWindowCloseRequest, useMarkdownStartupDocument } from "../useMarkdownDocumentEvents";

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
  beforeWindowClose: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
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
    (beforeWindowClose as jest.Mock).mockClear();
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

  it.each(["close", "quit"] as const)("keeps the %s guard across Autosave changes and saves the exact latest draft", async (reason) => {
    const savedBytes = "Autosave sentinel ALPHA.\r\n";
    const draftBytes = "Autosave sentinel CLOSE.\r\n";
    let diskBytes = savedBytes;
    const prepare = jest.fn(async ({ autosaveEnabled }: { autosaveEnabled: boolean }) => {
      if (autosaveEnabled) diskBytes = draftBytes;
      return autosaveEnabled;
    });
    const handleError = jest.fn();
    function Harness({ enabled }: { enabled: boolean }) {
      const options = { autosaveEnabled: enabled, handleError, prepareCurrentDocumentForClose: prepare };
      if (reason === "close") useMarkdownWindowCloseRequest(options);
      else useMarkdownAppExit(options);
      return null;
    }
    const registration = (reason === "close" ? beforeWindowClose : beforeQuit) as jest.Mock;
    registration.mockClear();
    const view = await render(<Harness enabled={false} />);
    await view.rerender(<Harness enabled />);
    expect(registration).toHaveBeenCalledTimes(1);
    const guard = registration.mock.calls[0][reason === "close" ? 1 : 0];
    expect(await guard()).toBe(true);
    expect(diskBytes).toBe(draftBytes);
    await view.rerender(<Harness enabled={false} />);
    expect(await guard()).toBe(false);
    expect(registration).toHaveBeenCalledTimes(1);
    expect(handleError).not.toHaveBeenCalled();
  });

  it("serializes close-guard teardown during a development remount", async () => {
    const registration = beforeWindowClose as jest.Mock;
    let claimed = false;
    registration.mockImplementation(async () => {
      if (claimed) throw new Error("Window already has a close guard");
      claimed = true;
      return { remove: async () => { await Promise.resolve(); claimed = false; } };
    });
    const handleError = jest.fn();
    const bytes = "Close sentinel EXACT.\r\n";
    let disk = "";
    function Harness() {
      useMarkdownWindowCloseRequest({ autosaveEnabled: true, handleError,
        prepareCurrentDocumentForClose: async () => { disk = bytes; return true; } });
      return null;
    }
    const view = await render(<React.StrictMode><Harness /></React.StrictMode>);
    await waitFor(() => expect(registration).toHaveBeenCalledTimes(2));
    expect(await registration.mock.calls.at(-1)![1]()).toBe(true);
    expect(disk).toBe(bytes);
    expect(handleError).not.toHaveBeenCalled();
    await view.unmount();
    registration.mockImplementation(async () => ({ remove: jest.fn(async () => {}) }));
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
