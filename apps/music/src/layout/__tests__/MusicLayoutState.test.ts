import { createObservableFile } from "@legend-desktop/storage";
import {
    DEFAULT_MAIN_LAYOUT,
    cloneMusicLayoutFile,
    mainLayout$,
    normalizeMusicLayoutFile,
    normalizeMusicLayoutNode,
} from "../MusicLayoutState";

describe("MusicLayoutState", () => {
    it("persists the default layout file through storage", () => {
        expect(mainLayout$).toBeDefined();
        expect(createObservableFile).toHaveBeenCalledWith(
            expect.objectContaining({
                filename: "mainLayout",
                initialValue: DEFAULT_MAIN_LAYOUT,
                saveDefaultToFile: true,
                subfolder: "data",
            }),
        );
    });

    it("falls back to the default layout for invalid files", () => {
        expect(normalizeMusicLayoutFile({ version: 1, main: { type: "leaf", id: "unknown" } })).toEqual(
            DEFAULT_MAIN_LAYOUT,
        );
        expect(normalizeMusicLayoutFile(null)).toEqual(DEFAULT_MAIN_LAYOUT);
    });

    it("preserves omitted children as default-layout intent", () => {
        expect(normalizeMusicLayoutNode({ type: "leaf", id: "library" })).toEqual({
            type: "leaf",
            id: "library",
        });
    });

    it("preserves explicit empty children", () => {
        expect(normalizeMusicLayoutNode({ type: "leaf", id: "library", children: [] })).toEqual({
            type: "leaf",
            id: "library",
            children: [],
        });
    });

    it("drops invalid branches and playback controls", () => {
        expect(
            normalizeMusicLayoutNode({
                type: "stack",
                direction: "horizontal",
                children: [
                    { type: "leaf", id: "playbackControls", controls: ["previous", "bad", "spacer"] },
                    { type: "leaf", id: "bad" },
                ],
            }),
        ).toEqual({
            type: "stack",
            direction: "horizontal",
            children: [{ type: "leaf", id: "playbackControls", controls: ["previous", "spacer"] }],
        });
    });

    it("clones default layouts so callers cannot mutate shared defaults", () => {
        const cloned = cloneMusicLayoutFile(DEFAULT_MAIN_LAYOUT);
        expect(cloned).toEqual(DEFAULT_MAIN_LAYOUT);
        expect(cloned).not.toBe(DEFAULT_MAIN_LAYOUT);
        expect(cloned.main).not.toBe(DEFAULT_MAIN_LAYOUT.main);
    });
});
