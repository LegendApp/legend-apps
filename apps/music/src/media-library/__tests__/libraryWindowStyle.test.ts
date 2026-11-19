import { getMusicTheme } from "../../theme/musicThemes";
import { createLibraryWindowStyle } from "../libraryWindowStyle";

// Opening and restyling the window replaces its registered `macos` options, so the style must carry the whole title bar.
test("keeps the library title bar transparent and untitled over the full-size content", () => {
    const style = createLibraryWindowStyle(getMusicTheme("dark"));

    expect(style.macos?.titleBar).toEqual({ contentLayout: "fullSize", transparent: true, titleVisibility: "hidden" });
});
