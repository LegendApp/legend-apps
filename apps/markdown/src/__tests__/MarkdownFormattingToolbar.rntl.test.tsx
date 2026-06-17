import { fireEvent, render } from "@testing-library/react-native";
import React, { createRef } from "react";
import type { MarkdownDocumentCommands } from "@legend-desktop/markdown-document";
import { MarkdownFormattingToolbar } from "../MarkdownFormattingToolbar";

const mockToolbarLayouts = {
  selection: {
    shown: ["bold", "italic", "underline", "strikethrough", "link", "code-block"],
  },
  top: {
    shown: ["paragraph", "heading-1", "heading-2"],
  },
};

jest.mock("../markdownSettings", () => ({
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
    mockToolbarLayouts.selection = {
      shown: ["bold", "italic", "link"],
    };
    mockToolbarLayouts.top = {
      shown: ["paragraph", "heading-1", "heading-2"],
    };
  });

  it("renders top bottom and floating toolbar controls from their configured layouts", async () => {
    const { commands, commandsRef } = commandsRefFixture();

    const view = await render(
      <>
        <MarkdownFormattingToolbar commandsRef={commandsRef} />
        <MarkdownFormattingToolbar commandsRef={commandsRef} placement="bottom" />
        <MarkdownFormattingToolbar commandsRef={commandsRef} floating />
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

    expect(commands.setHeading).toHaveBeenCalledWith(1);
    expect(commands.toggleBold).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});
