import { AutoUpdater } from "@legend-apps/auto-updater";
import { useNativeMenu } from "@legend-apps/native-menu";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ChatHistoryAppMenu } from "../ChatHistoryAppMenu";

jest.mock("@legend-apps/auto-updater", () => ({
  AutoUpdater: {
    isAvailable: jest.fn(),
    checkForUpdates: jest.fn(),
    setAutomaticallyChecksForUpdates: jest.fn(),
    setUpdateCheckInterval: jest.fn(),
  },
}));
jest.mock("@legend-apps/native-menu", () => ({ useNativeMenu: jest.fn() }));

describe("Chat History updates", () => {
  let renderer: ReactTestRenderer | undefined;
  const testGlobals = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDev = testGlobals.__DEV__;
  const getMenu = () => jest.mocked(useNativeMenu).mock.calls.at(-1)![0];
  const clickUpdate = () => getMenu().handlers!.checkForUpdates({
    ownerId: "chat-history", menuId: "app", itemId: "checkForUpdates",
  });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    testGlobals.__DEV__ = false;
    jest.resetAllMocks();
    jest.mocked(AutoUpdater.isAvailable).mockReturnValue(true);
    jest.mocked(AutoUpdater.checkForUpdates).mockResolvedValue(true);
    jest.mocked(AutoUpdater.setAutomaticallyChecksForUpdates).mockResolvedValue(true);
    jest.mocked(AutoUpdater.setUpdateCheckInterval).mockResolvedValue(true);
  });

  afterEach(async () => {
    if (renderer) await act(async () => renderer!.unmount());
    renderer = undefined;
    testGlobals.__DEV__ = originalDev;
    jest.restoreAllMocks();
  });

  it("starts daily automatic checks and routes the manual menu action", async () => {
    await act(async () => { renderer = create(<ChatHistoryAppMenu />); });
    expect(AutoUpdater.setUpdateCheckInterval).toHaveBeenCalledWith(86400);
    expect(AutoUpdater.setAutomaticallyChecksForUpdates).toHaveBeenCalledWith(true);
    expect(AutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(getMenu().ownerId).toBe("chat-history");
    expect(getMenu().menus[0]).toMatchObject({
      systemMenu: "app",
      items: [{ id: "checkForUpdates", title: "Check for Updates…", enabled: true }],
    });
    await act(async () => clickUpdate());
    expect(AutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    await act(async () => renderer!.update(<ChatHistoryAppMenu />));
    expect(AutoUpdater.setAutomaticallyChecksForUpdates).toHaveBeenCalledTimes(1);
  });

  it.each(["development", "unavailable"])("does not start checks when %s", async (mode) => {
    testGlobals.__DEV__ = mode === "development";
    jest.mocked(AutoUpdater.isAvailable).mockReturnValue(mode !== "unavailable");
    await act(async () => { renderer = create(<ChatHistoryAppMenu />); });
    expect(getMenu().menus[0].items[0].enabled).toBe(false);
    await act(async () => clickUpdate());
    expect(AutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(AutoUpdater.setUpdateCheckInterval).not.toHaveBeenCalled();
    expect(AutoUpdater.setAutomaticallyChecksForUpdates).not.toHaveBeenCalled();
  });

  it("reports automatic-check setup errors", async () => {
    const report = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(AutoUpdater.setUpdateCheckInterval).mockRejectedValueOnce(new Error("Setup failed"));
    await act(async () => { renderer = create(<ChatHistoryAppMenu />); });
    expect(report).toHaveBeenCalledWith("[ChatHistoryUpdater] Setup failed");
    expect(AutoUpdater.setAutomaticallyChecksForUpdates).not.toHaveBeenCalled();
  });

  it("reports manual-check errors", async () => {
    const report = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(AutoUpdater.checkForUpdates).mockRejectedValueOnce(new Error("Update in progress"));
    await act(async () => { renderer = create(<ChatHistoryAppMenu />); });
    await act(async () => clickUpdate());
    expect(report).toHaveBeenCalledWith("[ChatHistoryUpdater] Update in progress");
  });
});
