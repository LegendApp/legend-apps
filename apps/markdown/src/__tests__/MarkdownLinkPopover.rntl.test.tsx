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
