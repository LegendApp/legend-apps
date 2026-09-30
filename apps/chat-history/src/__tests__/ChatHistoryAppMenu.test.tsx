import { getUpdateStatus, configureUpdates, startUpdates, checkForUpdates } from "@legendapp/spark/updates";
import { useMenu } from "@legendapp/spark/menus";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ChatHistoryAppMenu } from "../ChatHistoryAppMenu";

jest.mock("@legendapp/spark/updates", () => ({ getUpdateStatus: jest.fn(), configureUpdates: jest.fn(), startUpdates: jest.fn(), checkForUpdates: jest.fn() }));
jest.mock("@legendapp/spark/menus", () => ({ useMenu: jest.fn() }));

describe("Chat History updates", () => {
  let renderer: ReactTestRenderer | undefined;
  const testGlobals = globalThis as typeof globalThis & { __DEV__?: boolean };
  const originalDev = testGlobals.__DEV__;
  const getMenu = () => jest.mocked(useMenu).mock.calls.at(-1)![0];
  const clickUpdate = () => getMenu().onAction?.({ type: "action", itemId: "checkForUpdates" });
  const updateItem = () => { const item = getMenu().items[0]; if (item.type !== "submenu") throw Error("Expected app submenu"); return item.items[0]; };


  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    testGlobals.__DEV__ = false;
    jest.resetAllMocks();
    jest.mocked(getUpdateStatus).mockResolvedValue({ available: true, state: "idle" } as any);
    jest.mocked(checkForUpdates).mockResolvedValue(undefined);
    jest.mocked(startUpdates).mockResolvedValue(undefined);
    jest.mocked(configureUpdates).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (renderer) await act(async () => renderer!.unmount());
    renderer = undefined;
    testGlobals.__DEV__ = originalDev;
    jest.restoreAllMocks();
  });

  it("starts daily automatic checks and routes the manual menu action", async () => {
    await act(async () => { renderer = create(<ChatHistoryAppMenu />); });
    expect(configureUpdates).toHaveBeenCalledWith({ automaticallyChecks: true, checkIntervalSeconds: 86400 });
    expect(startUpdates).toHaveBeenCalledWith();
    expect(checkForUpdates).not.toHaveBeenCalled();
    expect(getMenu().id).toBe("chat-history");
    expect(getMenu().items[0]).toMatchObject({
      target: { menu: "app" },
      items: [{ type: "action", id: "checkForUpdates", label: "Check for Updates…", disabled: !(true) }],
    });
    await act(async () => clickUpdate());
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    await act(async () => renderer!.update(<ChatHistoryAppMenu />));
    expect(startUpdates).toHaveBeenCalledTimes(1);
  });

  it.each(["development", "unavailable"])("does not start checks when %s", async (mode) => {
    testGlobals.__DEV__ = mode === "development";
    jest.mocked(getUpdateStatus).mockResolvedValue({ available: mode !== "unavailable", state: "idle" } as any);
    await act(async () => { renderer = create(<ChatHistoryAppMenu />); });
    expect(updateItem()).toMatchObject({ disabled: true });
    await act(async () => clickUpdate());
    expect(checkForUpdates).not.toHaveBeenCalled();
    expect(configureUpdates).not.toHaveBeenCalled();
    expect(startUpdates).not.toHaveBeenCalled();
  });

  it("reports automatic-check setup errors", async () => {
    const report = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(configureUpdates).mockRejectedValueOnce(new Error("Setup failed"));
    await act(async () => { renderer = create(<ChatHistoryAppMenu />); });
    expect(report).toHaveBeenCalledWith("[ChatHistoryUpdater] Error: Setup failed");
    expect(startUpdates).not.toHaveBeenCalled();
  });

  it("reports manual-check errors", async () => {
    const report = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.mocked(checkForUpdates).mockRejectedValueOnce(new Error("Update in progress"));
    await act(async () => { renderer = create(<ChatHistoryAppMenu />); });
    await act(async () => clickUpdate());
    expect(report).toHaveBeenCalledWith("[ChatHistoryUpdater] Error: Update in progress");
  });
});
