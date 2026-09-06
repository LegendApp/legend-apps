import { getRecentChats, openChat, type ChatSummary } from "@legend-apps/chat-history";
import { addApplicationReopenRequestedListener, openWindow, setMainWindowOptions } from "@legend-apps/window-manager";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { App, ChatHistoryWindow } from "../App";
import { getChatBenchmarkConfig } from "../chatBenchmark";
import { readSavedChatSelection } from "../chatStorage";

jest.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  View: "View",
}));
jest.mock("uniwind", () => ({ Uniwind: { setTheme: jest.fn() } }));
jest.mock("@legend-apps/appkit-split-view", () => ({
  createSidebarSplitViewTitlebarChrome: () => ({}),
  SidebarSplitView: "SidebarSplitView",
  sidebarSplitViewTitlebarMetrics: { contentInsetTop: 52, sidebarInsetTop: 52 },
}));
jest.mock("@legend-apps/chat-history", () => ({
  cancelPendingOpen: jest.fn(),
  getRecentChats: jest.fn().mockResolvedValue([]),
  openChat: jest.fn(),
}));
jest.mock("@legend-apps/theme", () => ({
  useSystemLegendDisplayTheme: () => ({
    appearance: "light",
    colors: { windowBackground: "#f5f6f8", background: "#fff", surfaceMuted: "#eee" },
  }),
}));
jest.mock("@legend-apps/window-manager", () => ({
  addApplicationReopenRequestedListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  openWindow: jest.fn().mockResolvedValue({ success: true }),
  setMainWindowOptions: jest.fn().mockResolvedValue({ success: true }),
}));
// A host-root app must not register or open a second React window.
jest.mock("@legend-apps/windows", () => ({
  createWindowsNavigator: () => { throw new Error("Chat History must use the host window"); },
}));
jest.mock("@legendapp/list/react-native", () => ({ LegendList: "LegendList" }));
jest.mock("../ChatComposer", () => ({ ChatComposer: "ChatComposer" }));
jest.mock("../DemoTranscriptRow", () => ({ DemoTranscriptRow: "DemoTranscriptRow" }));
jest.mock("../TranscriptRow", () => ({ TranscriptRow: "TranscriptRow" }));
jest.mock("../chatStorage", () => ({
  flushSelectedChatWrite: jest.fn(),
  readSavedChatSelection: jest.fn(() => ({})),
  writeSelectedChat: jest.fn(),
}));
jest.mock("../chatBenchmark", () => ({
  emitChatBenchmarkEvent: jest.fn(),
  getChatBenchmarkConfig: jest.fn(),
}));

describe("Chat History host window", () => {
  let renderer: ReactTestRenderer;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getRecentChats).mockResolvedValue([]);
    jest.mocked(openChat).mockImplementation(() => new Promise(() => {}));
  });

  afterEach(async () => {
    if (renderer) {
      await act(async () => renderer.unmount());
    }
  });

  it("renders one chat in the host and updates that window without opening another", async () => {
    const launchArguments = ["Legend Chat History", "--example-launch-argument"];
    await act(async () => {
      renderer = create(<App launchArguments={launchArguments} />);
    });

    expect(renderer!.root.findAllByType(ChatHistoryWindow)).toHaveLength(1);
    expect(renderer!.root.findByType(ChatHistoryWindow).props.launchArguments).toBe(launchArguments);
    expect(getChatBenchmarkConfig).toHaveBeenCalledWith(launchArguments);
    expect(getRecentChats).toHaveBeenCalledTimes(1);
    expect(setMainWindowOptions).toHaveBeenCalledWith({
      title: "Legend Chat History",
      windowStyle: {
        appearance: "system",
        backgroundColor: "#f5f6f8",
        titlebarSeparatorStyle: "shadow",
      },
    });
    expect(openWindow).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer!.toJSON())).toContain("No local Codex or Claude transcripts found.");
  });

  it("discovers benchmark chats instead of accepting fixture paths", async () => {
    const initial: ChatSummary = { id: "codex:initial", title: "Initial", path: "/discovered-initial.jsonl", provider: "codex", updatedAt: 2 };
    const secondary: ChatSummary = { id: "codex:secondary", title: "Secondary", path: "/discovered-secondary.jsonl", provider: "codex", updatedAt: 1 };
    jest.mocked(getChatBenchmarkConfig).mockReturnValueOnce({
      eventFileName: "events.json",
      loadImages: false,
      switchDelayMs: 3_000,
      targets: [
        { id: initial.id, provider: initial.provider },
        { id: secondary.id, provider: secondary.provider },
      ],
      version: 2,
    });
    jest.mocked(getRecentChats).mockResolvedValueOnce([initial, secondary]);

    await act(async () => { renderer = create(<App />); });

    expect(getRecentChats).toHaveBeenCalledWith(1_000_000);
    expect(openChat).toHaveBeenCalledWith("codex", "/discovered-initial.jsonl");
  });

  it("opens a saved chat while catalog discovery is still pending", async () => {
    const saved: ChatSummary = {
      id: "saved",
      path: "/saved.jsonl",
      provider: "codex",
      title: "Saved",
      updatedAt: 1,
    };
    jest.mocked(readSavedChatSelection).mockReturnValueOnce({ selectedChat: saved, selectedId: saved.id });
    jest.mocked(getRecentChats).mockReturnValueOnce(new Promise(() => {}));

    await act(async () => { renderer = create(<App />); });

    expect(openChat).toHaveBeenCalledWith("codex", "/saved.jsonl");
    expect(setMainWindowOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Saved" }));
  });

  it("refreshes on reopen while retaining an unchanged selected transcript", async () => {
    const original: ChatSummary = { id: "old", title: "Original", path: "/old.jsonl", provider: "codex", updatedAt: 1 };
    const latest: ChatSummary = { id: "new", title: "New", path: "/new.jsonl", provider: "codex", updatedAt: 2 };
    jest.mocked(getRecentChats).mockResolvedValueOnce([original]);
    await act(async () => { renderer = create(<App />); });
    expect(openChat).toHaveBeenCalledTimes(1);
    const reopen = jest.mocked(addApplicationReopenRequestedListener).mock.calls[0]![0];
    jest.mocked(getRecentChats).mockResolvedValueOnce([latest, { ...original }]);
    await act(async () => { reopen({ hasVisibleWindows: false }); });
    expect(getRecentChats).toHaveBeenCalledTimes(2);
    expect(openChat).toHaveBeenCalledTimes(1);
    const sidebar = renderer!.root.findAllByType("LegendList" as never)[0]!;
    expect(sidebar.props.extraData).toBe(original.id);
    expect(sidebar.props.data.some((entry: { summary?: ChatSummary }) => entry.summary?.id === latest.id)).toBe(true);
    await act(async () => { reopen({ hasVisibleWindows: true }); });
    expect(getRecentChats).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale catalog response after a newer reopen refresh", async () => {
    let resolveInitial!: (chats: ChatSummary[]) => void;
    jest.mocked(getRecentChats).mockReturnValueOnce(new Promise((resolve) => { resolveInitial = resolve; }));
    await act(async () => { renderer = create(<App />); });
    const reopen = jest.mocked(addApplicationReopenRequestedListener).mock.calls[0]![0];
    const latest: ChatSummary = { id: "new", title: "New", path: "/new.jsonl", provider: "codex", updatedAt: 2 };
    jest.mocked(getRecentChats).mockResolvedValueOnce([latest]);
    await act(async () => { reopen({ hasVisibleWindows: false }); });
    await act(async () => { resolveInitial([]); });
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(setMainWindowOptions).toHaveBeenLastCalledWith(expect.objectContaining({ title: "New" }));
  });
});
