import { addAppExitListener, completeAppExit } from "@legend-apps/app-exit";
import {
  installDiffAppExitHandler,
  prepareDiffWindowsForAppExit,
  registerDiffWindowExitPreparation,
} from "../diffAppExit";

const mockAddAppExitListener = addAppExitListener as jest.MockedFunction<typeof addAppExitListener>;
const mockCompleteAppExit = completeAppExit as jest.MockedFunction<typeof completeAppExit>;

describe("diffAppExit", () => {
  beforeEach(() => {
    mockAddAppExitListener.mockReset();
    mockCompleteAppExit.mockReset();
    mockAddAppExitListener.mockReturnValue({ remove: jest.fn() });
  });

  it("prepares every registered window before allowing app exit", async () => {
    const calls: string[] = [];
    const unregisterFirst = registerDiffWindowExitPreparation("first", async (reason) => {
      calls.push(`first:${reason}`);
      return true;
    });
    const unregisterSecond = registerDiffWindowExitPreparation("second", async (reason) => {
      calls.push(`second:${reason}`);
      return true;
    });

    await expect(prepareDiffWindowsForAppExit()).resolves.toBe(true);
    expect(calls).toEqual(["first:quit", "second:quit"]);

    unregisterFirst();
    unregisterSecond();
  });

  it("cancels app exit when a window keeps its drafts", async () => {
    const unregisterFirst = registerDiffWindowExitPreparation("first", async () => false);
    const second = jest.fn(async () => true);
    const unregisterSecond = registerDiffWindowExitPreparation("second", second);

    await expect(prepareDiffWindowsForAppExit()).resolves.toBe(false);
    expect(second).not.toHaveBeenCalled();

    unregisterFirst();
    unregisterSecond();
  });

  it("completes a requested native exit once preparation finishes", async () => {
    const unregister = registerDiffWindowExitPreparation("viewer", async () => true);
    const reportError = jest.fn();
    installDiffAppExitHandler(reportError);

    mockAddAppExitListener.mock.calls[0][0]({ reason: "requested" });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockCompleteAppExit).toHaveBeenCalledWith(true);
    expect(reportError).not.toHaveBeenCalled();
    unregister();
  });
});
