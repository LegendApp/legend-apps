import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { ToolbarLayoutEditor } from "../settings/ToolbarLayoutEditor";

const mockSetMarkdownToolbarLayoutSetting = jest.fn();
const mockToolbarLayout = {
  shown: ["paragraph", "heading-1", "bold"],
};

jest.mock("@legend-desktop/reorder-controls", () => {
  const React = require("react");
  const { View } = require("react-native");

  return {
    DragDropProvider: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
    DraggableItem: ({ children, data, id, ...props }: { children: React.ReactNode; data: () => unknown; id: string }) => React.createElement(
      View,
      {
        ...props,
        testID: `draggable-${id}`,
        dragData: data(),
      },
      children,
    ),
    DroppableZone: ({ children, id, onDrop, ...props }: { children: (isActive: boolean) => React.ReactNode; id: string; onDrop: (item: unknown) => void }) => React.createElement(
      View,
      {
        ...props,
        onDrop,
        testID: id,
      },
      children(false),
    ),
  };
});

jest.mock("@legend-desktop/sf-symbol", () => ({
  SFSymbol: () => null,
}));

jest.mock("../markdownSettings", () => ({
  resetMarkdownToolbarLayoutSetting: jest.fn(),
  setMarkdownToolbarLayoutSetting: (layoutId: string, layout: unknown) => mockSetMarkdownToolbarLayoutSetting(layoutId, layout),
  useMarkdownToolbarLayoutSetting: () => mockToolbarLayout,
}));

const { resetMarkdownToolbarLayoutSetting: mockResetMarkdownToolbarLayoutSetting } = jest.requireMock("../markdownSettings") as {
  resetMarkdownToolbarLayoutSetting: jest.Mock;
};

describe("ToolbarLayoutEditor", () => {
  beforeEach(() => {
    mockSetMarkdownToolbarLayoutSetting.mockClear();
    mockResetMarkdownToolbarLayoutSetting.mockClear();
  });

  it("updates the stored layout when a shown toolbar item is dropped into hidden controls", async () => {
    const view = await render(
      <ToolbarLayoutEditor
        description="Customize toolbar"
        layoutId="top"
        title="Top and Bottom Toolbars"
      />,
    );

    const hiddenDropZone = view.getByTestId("markdown-toolbar-hidden-drop-0");
    hiddenDropZone.props.onDrop({
      data: {
        group: "shown",
        itemId: "bold",
      },
    });

    expect(mockSetMarkdownToolbarLayoutSetting).toHaveBeenCalledWith("top", {
      shown: ["paragraph", "heading-1"],
    });
    await view.unmount();
  });

  it("exposes stable draggable ids for toolbar controls", async () => {
    const view = await render(
      <ToolbarLayoutEditor
        description="Customize toolbar"
        layoutId="top"
        title="Top and Bottom Toolbars"
      />,
    );

    expect(view.getByTestId("draggable-top-shown-paragraph").props.dragData).toEqual({
      group: "shown",
      itemId: "paragraph",
    });
    expect(view.getByTestId("draggable-top-shown-bold").props.dragData).toEqual({
      group: "shown",
      itemId: "bold",
    });
    await view.unmount();
  });

  it("resets the stored toolbar layout", async () => {
    const view = await render(
      <ToolbarLayoutEditor
        description="Customize toolbar"
        layoutId="top"
        title="Top and Bottom Toolbars"
      />,
    );

    await fireEvent.press(view.getByText("Reset"));

    expect(mockResetMarkdownToolbarLayoutSetting).toHaveBeenCalledWith("top");
    await view.unmount();
  });
});
