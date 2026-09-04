import { getRecentChats } from "@legend-apps/chat-history";
import { openWindow, setMainWindowOptions } from "@legend-apps/window-manager";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { App, ChatHistoryWindow } from "../App";
import { getChatBenchmarkConfig } from "../chatBenchmark";

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
  readSelectedChatId: jest.fn(),
  writeSelectedChatId: jest.fn(),
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

  beforeEach(() => jest.clearAllMocks());

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
});
