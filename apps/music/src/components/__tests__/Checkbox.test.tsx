import React from "react";
import { Text, View } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { Icon } from "../../systems/Icon";
import { Button } from "../Button";
import { Checkbox } from "../Checkbox";

jest.mock("../TooltipProvider", () => ({
    useTooltip: () => ({ showTooltip: jest.fn(), hideTooltip: jest.fn() }),
}));

it("centers the checked symbol in a square alongside its label", () => {
    let renderer!: ReactTestRenderer;
    act(() => { renderer = create(<Checkbox checked label="Local Music" />); });
    try {
        const button = renderer.root.findByType(Button);
        const box = button.findByType(View);
        const checkmark = box.findByType(Icon);

        expect(button.props.className).toContain("flex-row items-center");
        expect(button.findByType(Text).props.children).toBe("Local Music");
        expect(box.props.className).toContain("size-5");
        expect(box.props.className).toContain("items-center justify-center");
        expect(checkmark.props.name).toBe("checkmark");
        expect(checkmark.props.yOffset ?? 0).toBe(0);
    } finally {
        act(() => renderer.unmount());
    }
});
