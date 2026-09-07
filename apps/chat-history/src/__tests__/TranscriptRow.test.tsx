import type { ChatDocument, ChatRowMetadata } from "@legend-apps/chat-history";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Image } from "react-native";
import { TranscriptRow } from "../TranscriptRow";

jest.mock("react-native", () => {
  const React = require("react");
  return {
    Image: Object.assign((props: unknown) => React.createElement("Image", props), { getSize: jest.fn() }),
    Linking: { openURL: jest.fn() },
    Pressable: "Pressable",
    StyleSheet: { create: (styles: unknown) => styles },
    Text: "Text",
    View: "View",
  };
});
jest.mock("@legendapp/list/react-native", () => ({
  useRecyclingState: (initial: unknown) => require("react").useState(initial),
}));
jest.mock("@legend-apps/theme", () => ({ getLegendDisplayTheme: () => ({ markdownStyle: {} }) }));
jest.mock("uniwind", () => ({ useUniwind: () => ({ theme: "light" }) }));
jest.mock("react-native-enriched-markdown", () => ({ EnrichedMarkdownText: "EnrichedMarkdownText" }));

const metadata: ChatRowMetadata = {
  index: 999,
  kind: "user",
  hasImagePlaceholder: false,
  hasToolPreview: false,
  imageCount: 1,
};

describe("transcript image layout", () => {
  let renderer: ReactTestRenderer | undefined;
  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => jest.clearAllMocks());
  afterEach(async () => {
    if (renderer) await act(async () => renderer!.unmount());
    renderer = undefined;
  });

  it("uses native dimensions on first render and only reads the mounted row", async () => {
    const getImageMetadata = jest.fn(() => ({ source: "/tail image.png", width: 400, height: 800 }));
    const document = { rowCount: 1000, getImageMetadata } as unknown as ChatDocument;
    await act(async () => {
      renderer = create(<TranscriptRow document={document} index={999} metadata={metadata} />);
    });
    expect(getImageMetadata).toHaveBeenCalledTimes(1);
    expect(getImageMetadata).toHaveBeenCalledWith(999, 0);
    const image = renderer!.root.findByType("Image" as never);
    expect(image.props.style).toContainEqual({ aspectRatio: 0.5 });
    expect(image.props.source).toEqual({ uri: "file:///tail%20image.png" });
    expect(Image.getSize).not.toHaveBeenCalled();
  });

  it("does not read image metadata when images are disabled", async () => {
    const getImageMetadata = jest.fn();
    const document = { getImageMetadata } as unknown as ChatDocument;
    await act(async () => {
      renderer = create(<TranscriptRow document={document} index={999} metadata={metadata} loadImages={false} />);
    });
    expect(getImageMetadata).not.toHaveBeenCalled();
    expect(Image.getSize).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType("Image" as never)).toHaveLength(0);
  });

  it("keeps asynchronous sizing for unknown sources and ignores obsolete callbacks", async () => {
    const getImageMetadata = jest.fn(() => ({ source: "https://example.test/image.png" }));
    const document = { getImageMetadata } as unknown as ChatDocument;
    await act(async () => {
      renderer = create(<TranscriptRow document={document} index={999} metadata={metadata} />);
    });
    const finishRemoteSize = jest.mocked(Image.getSize).mock.calls[0]![1]!;
    expect(Image.getSize).toHaveBeenCalledWith("https://example.test/image.png", expect.any(Function), expect.any(Function));
    await act(async () => { finishRemoteSize(600, 300); });
    expect(renderer!.root.findByType("Image" as never).props.style).toContainEqual({ aspectRatio: 2 });

    getImageMetadata.mockReturnValue({ source: "/next.png", width: 200, height: 400 } as never);
    await act(async () => {
      renderer!.update(<TranscriptRow document={document} index={998} metadata={{ ...metadata, index: 998 }} />);
    });
    await act(async () => { finishRemoteSize(1, 10); });
    expect(renderer!.root.findByType("Image" as never).props.style).toContainEqual({ aspectRatio: 0.5 });
  });
});
