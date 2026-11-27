import { fireEvent, render } from "@testing-library/react-native";
import React, { createRef } from "react";
import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import { MarkdownFormattingToolbar } from "../MarkdownFormattingToolbar";

const mockToolbarLayouts = {
  selection: {
    shown: ["bold", "italic", "underline", "strikethrough", "link", "code-block"],
  },
  top: {
    shown: ["paragraph", "heading-1", "heading-2"],
  },
};

const mockPluginCommand = {
  id: "com.example.house-style.check-document",
  kind: "checkDocument",
  rules: [{ enabled: true, find: "log in", id: "com.example.house-style.sign-in", replace: "sign in", title: "Sign in" }],
  title: "Check Document",
};
const mockPlugin = { enabled: false };

jest.mock("../markdownSettings", () => ({
  getMarkdownPluginCommand: () => (mockPlugin.enabled ? mockPluginCommand : undefined),
  useMarkdownDisplayThemeSetting: () => "light",
  useMarkdownPluginToolbarCommands: (layoutId: "selection" | "top") => (mockPlugin.enabled && layoutId === "top" ? [mockPluginCommand] : []),
  useMarkdownToolbarLayoutSetting: (layoutId: "selection" | "top") => mockToolbarLayouts[layoutId],
}));

function commandsFixture() {
  return {
    insertLink: jest.fn(),
    insertThematicBreak: jest.fn(),
    setHeading: jest.fn(),
    setParagraph: jest.fn(),
    toggleBlockquote: jest.fn(),
    toggleBold: jest.fn(),
    toggleCodeBlock: jest.fn(),
    toggleItalic: jest.fn(),
    toggleOrderedList: jest.fn(),
    toggleSpoiler: jest.fn(),
    toggleStrikethrough: jest.fn(),
    toggleTaskList: jest.fn(),
    toggleUnderline: jest.fn(),
    toggleUnorderedList: jest.fn(),
  } as unknown as MarkdownDocumentCommands;
}

function commandsRefFixture(commands = commandsFixture()) {
  const commandsRef = createRef<MarkdownDocumentCommands>();
  commandsRef.current = commands;
  return { commands, commandsRef };
}

describe("MarkdownFormattingToolbar", () => {
  beforeEach(() => {
    mockPlugin.enabled = false;
    mockToolbarLayouts.selection = {
      shown: ["bold", "italic", "link"],
    };
    mockToolbarLayouts.top = {
      shown: ["paragraph", "heading-1", "heading-2"],
    };
  });

  it("renders top bottom and floating toolbar controls from their configured layouts", async () => {
    const { commands, commandsRef } = commandsRefFixture();
    const onInsertLink = jest.fn();

    const view = await render(
      <>
        <MarkdownFormattingToolbar commandsRef={commandsRef} />
        <MarkdownFormattingToolbar commandsRef={commandsRef} placement="bottom" />
        <MarkdownFormattingToolbar commandsRef={commandsRef} floating onInsertLink={onInsertLink} />
      </>,
    );

    expect(view.getAllByLabelText("Paragraph")).toHaveLength(2);
    expect(view.getAllByLabelText("Heading 1")).toHaveLength(2);
    expect(view.getAllByLabelText("Heading 2")).toHaveLength(2);
    expect(view.getByLabelText("Bold")).toBeTruthy();
    expect(view.getByLabelText("Italic")).toBeTruthy();
    expect(view.getByLabelText("Link")).toBeTruthy();
    expect(view.queryByLabelText("Code Block")).toBeNull();

    await fireEvent(view.getAllByLabelText("Heading 1")[0], "pressIn");
    await fireEvent(view.getByLabelText("Bold"), "pressIn");
    await fireEvent(view.getByLabelText("Link"), "pressIn");

    expect(commands.setHeading).toHaveBeenCalledWith(1);
    expect(commands.toggleBold).toHaveBeenCalledTimes(1);
    expect(onInsertLink).toHaveBeenCalledTimes(1);
    expect(commands.insertLink).not.toHaveBeenCalled();
    for (const label of ["Paragraph", "Bold", "Italic", "Link"]) {
      expect(view.getAllByLabelText(label)[0].props.tooltip).toBe(label);
    }
    await view.unmount();
  });

  it("checks the document with a plugin command, applies the fix, and withdraws stale or disabled fixes", async () => {
    mockPlugin.enabled = true;
    const blocks = [{ id: "b0", markdown: "Please log in to continue." }, { id: "b1", markdown: "Second." }];
    const commands = {
      ...commandsFixture(),
      readBlocks: jest.fn(async () => blocks),
      replaceBlockMarkdown: jest.fn(async () => true),
    } as unknown as MarkdownDocumentCommands;
    const { commandsRef } = commandsRefFixture(commands);
    const view = await render(<MarkdownFormattingToolbar commandsRef={commandsRef} />);

    await fireEvent.press(view.getByLabelText("Check Document"));
    expect(view.getByLabelText("Plugin result").props.children).toBe("Replace “log in” with “sign in”");
    await fireEvent.press(view.getByLabelText("Apply Fix"));
    expect(commands.replaceBlockMarkdown).toHaveBeenCalledWith("b0", "Please log in to continue.", "Please sign in to continue.");
    expect(view.getByLabelText("Plugin result").props.children).toBe("Fix applied");

    jest.mocked(commands.replaceBlockMarkdown).mockResolvedValueOnce(false);
    await fireEvent.press(view.getByLabelText("Check Document"));
    await fireEvent.press(view.getByLabelText("Apply Fix"));
    expect(view.getByLabelText("Plugin result").props.children).toBe("Document changed; suggestion withdrawn. Check again.");

    await fireEvent.press(view.getByLabelText("Check Document"));
    mockPlugin.enabled = false;
    await fireEvent.press(view.getByLabelText("Apply Fix"));
    expect(commands.replaceBlockMarkdown).toHaveBeenCalledTimes(2);
    expect(view.getByLabelText("Plugin result").props.children).toBe("Plugin is disabled");
    await view.unmount();
  });
});
