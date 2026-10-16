import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { MarkdownLinkPopover } from "../MarkdownLinkPopover";

describe("MarkdownLinkPopover", () => {
  it("submits a trimmed link URL", async () => {
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    const view = await render(<MarkdownLinkPopover onCancel={onCancel} onSubmit={onSubmit} />);

    await fireEvent.changeText(view.getByLabelText("Link URL"), " https://legendapp.com ");
    await fireEvent.press(view.getByLabelText("Apply"));

    expect(onSubmit).toHaveBeenCalledWith("https://legendapp.com");
    expect(onCancel).not.toHaveBeenCalled();
    await view.unmount();
  });

  it.each([
    ["https://example", " https://example.com ", "https://example.com"],
    ["https://example.com", "   ", undefined],
  ])("submits the native input text instead of stale rendered state", async (renderedURL, nativeText, expected) => {
    const onSubmit = jest.fn();
    const view = await render(<MarkdownLinkPopover onCancel={jest.fn()} onSubmit={onSubmit} />);
    const input = view.getByLabelText("Link URL");
    await fireEvent.changeText(input, renderedURL);
    await fireEvent(input, "submitEditing", { nativeEvent: { text: nativeText } });
    if (expected) {
      expect(onSubmit).toHaveBeenCalledWith(expected);
    } else {
      expect(onSubmit).not.toHaveBeenCalled();
    }
    await view.unmount();
  });

  it("cancels without submitting", async () => {
    const onCancel = jest.fn();
    const onSubmit = jest.fn();
    const view = await render(<MarkdownLinkPopover onCancel={onCancel} onSubmit={onSubmit} />);

    await fireEvent.press(view.getByLabelText("Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    await view.unmount();
  });
});
