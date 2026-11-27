import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { beforeQuit } from "@legendapp/spark/app";
import { registerMarkdownWindowQuitGuard, useMarkdownAppExit, useMarkdownWindowCloseRequest } from "../useMarkdownDocumentEvents";

const mockAddAppExitListener = beforeQuit as jest.MockedFunction<typeof beforeQuit>;

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

function AppExitHarness({ handleError }: { handleError: (error: unknown) => void }) {
  useMarkdownAppExit(handleError);
  return null;
}

describe("useMarkdownAppExit", () => {
  beforeEach(() => {
    mockAddAppExitListener.mockReset();
    mockAddAppExitListener.mockResolvedValue({ remove: jest.fn(async () => {}) });
  });

  it("discards draft files only after every window approves quit", async () => {
    const first = { prepare: jest.fn(async () => true), discardDrafts: jest.fn() };
    const second = { prepare: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true), discardDrafts: jest.fn() };
    const unregisterFirst = registerMarkdownWindowQuitGuard(first);
    const unregisterSecond = registerMarkdownWindowQuitGuard(second);
    const handleError = jest.fn();
    const view = await render(<AppExitHarness handleError={handleError} />);
    try {
      const [guard] = mockAddAppExitListener.mock.calls[0];
      expect(await guard()).toBe(false);
      expect(first.discardDrafts).not.toHaveBeenCalled();
      expect(second.discardDrafts).not.toHaveBeenCalled();
      expect(await guard()).toBe(true);
      expect(first.discardDrafts).toHaveBeenCalledTimes(1);
      expect(second.discardDrafts).toHaveBeenCalledTimes(1);
      expect(handleError).not.toHaveBeenCalled();
    } finally {
      unregisterFirst();
      unregisterSecond();
      await view.unmount();
    }
  });
});

describe("useMarkdownWindowCloseRequest", () => {
  it("serializes close-guard teardown during a development remount", async () => {
    const registration = jest.mocked(beforeWindowClose);
    registration.mockClear();
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
      useMarkdownWindowCloseRequest({ handleError, windowId: "markdown-editor",
        prepareWindowForClose: async () => { disk = bytes; return true; } });
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

  it("uses the latest close callback and removes the guard on unmount", async () => {
    const remove = jest.fn(async () => {});
    jest.mocked(beforeWindowClose).mockClear();
    jest.mocked(beforeWindowClose).mockResolvedValue({ remove });
    const first = jest.fn(async () => true), second = jest.fn(async () => false);
    const handleError = jest.fn();
    function CloseHarness({ prepare }: { prepare: typeof first }) {
      useMarkdownWindowCloseRequest({ handleError, prepareWindowForClose: prepare, windowId: "markdown-editor" });
      return null;
    }
    const view = await render(<CloseHarness prepare={first} />);
    await view.rerender(<CloseHarness prepare={second} />);
    expect(beforeWindowClose).toHaveBeenCalledTimes(1);
    expect(await jest.mocked(beforeWindowClose).mock.calls[0][1]()).toBe(false);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    await view.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
