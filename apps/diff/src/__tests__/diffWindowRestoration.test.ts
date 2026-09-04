import { addWindowClosedListener, setWindowOptions } from "@legend-apps/window-manager";
import { getSavedDiffWindows, removeSavedDiffWindow } from "../diffAppMetadata";
import {
  installDiffWindowRestoration,
  restoreSavedDiffWindows,
  setDiffManagedWindowRestorationEnabled,
} from "../diffWindowRestoration";
import { openDiffViewerWindow } from "../diffWindows";

jest.mock("@legend-apps/window-manager", () => ({
  addWindowClosedListener: jest.fn(() => ({ remove: jest.fn() })),
  setWindowOptions: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("../diffAppMetadata", () => ({
  getSavedDiffWindows: jest.fn(),
  removeSavedDiffWindow: jest.fn(),
}));
jest.mock("../diffWindows", () => ({ openDiffViewerWindow: jest.fn().mockResolvedValue(undefined) }));

const frame = { height: 700, width: 900, x: 30, y: 40 };
const source = { kind: "folder" as const, label: "repo", value: "/tmp/repo" };

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getSavedDiffWindows).mockReturnValue([]);
});

it("restores only the primary source, not its legacy JS frame", async () => {
  jest.mocked(getSavedDiffWindows).mockReturnValue([
    { id: "diff-viewer-other", lastOpenedAt: 2, frame },
    { id: "main", lastOpenedAt: 1, frame, source },
  ]);
  const openPrimary = jest.fn().mockResolvedValue(undefined);

  expect(await restoreSavedDiffWindows(openPrimary)).toBe(2);
  expect(openPrimary).toHaveBeenCalledWith(source);
  expect(openDiffViewerWindow).toHaveBeenCalledTimes(1);
  expect(openDiffViewerWindow).toHaveBeenCalledWith(null, {
    frame,
    freshWindow: true,
    windowIdentifier: "diff-viewer-other",
  });
});

it("promotes a legacy secondary source without applying its frame to the primary window", async () => {
  jest.mocked(getSavedDiffWindows).mockReturnValue([
    { id: "diff-viewer-newest", lastOpenedAt: 3, frame, source },
    { id: "diff-viewer-second", lastOpenedAt: 2, frame, source },
    { id: "diff-viewer-oldest", lastOpenedAt: 1, frame, source },
  ]);
  const openPrimary = jest.fn().mockResolvedValue(undefined);

  expect(await restoreSavedDiffWindows(openPrimary)).toBe(3);
  expect(openPrimary).toHaveBeenCalledWith(source);
  expect(jest.mocked(openDiffViewerWindow).mock.calls).toEqual([
    [source, { frame, freshWindow: false, windowIdentifier: "diff-viewer-oldest" }],
    [source, { frame, freshWindow: false, windowIdentifier: "diff-viewer-second" }],
  ]);
});

it("toggles native restoration for managed viewers but not the host window", async () => {
  jest.mocked(getSavedDiffWindows).mockReturnValue([
    { id: "main", lastOpenedAt: 2 },
    { id: "diff-viewer-folder", lastOpenedAt: 1, source },
  ]);

  await setDiffManagedWindowRestorationEnabled(false);

  expect(setWindowOptions).toHaveBeenCalledTimes(1);
  expect(setWindowOptions).toHaveBeenCalledWith("diff-viewer-folder", { restoreOnLaunch: false });
});

it("restores an empty primary viewer without a frame", async () => {
  jest.mocked(getSavedDiffWindows).mockReturnValue([{ id: "main", lastOpenedAt: 1, frame }]);
  const openPrimary = jest.fn().mockResolvedValue(undefined);

  expect(await restoreSavedDiffWindows(openPrimary)).toBe(1);
  expect(openPrimary).toHaveBeenCalledWith(undefined);
  expect(openDiffViewerWindow).not.toHaveBeenCalled();
});

it("leaves first-launch defaults alone when there are no saved windows", async () => {
  const openPrimary = jest.fn().mockResolvedValue(undefined);
  expect(await restoreSavedDiffWindows(openPrimary)).toBe(0);
  expect(openPrimary).not.toHaveBeenCalled();
  expect(openDiffViewerWindow).not.toHaveBeenCalled();
});

it("tracks closed sessions without subscribing to frame changes", () => {
  const restoration = installDiffWindowRestoration();

  const onClose = jest.mocked(addWindowClosedListener).mock.calls[0]![0];
  onClose({ identifier: "main" });
  onClose({ identifier: "diff-viewer-folder" });
  onClose({ identifier: "diff-settings" });
  expect(jest.mocked(removeSavedDiffWindow).mock.calls).toEqual([["main"], ["diff-viewer-folder"]]);

  restoration.remove();
  expect(jest.mocked(addWindowClosedListener).mock.results[0]!.value.remove).toHaveBeenCalledTimes(1);
});
