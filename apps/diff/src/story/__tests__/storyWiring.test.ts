import { diffHotkeyDefinitions } from "../../diffHotkeys";
import { diffMenuConfig } from "../../diffMenus";
import { diffActiveMenuWindow$ } from "../../diffMenuState";
import { dispatchDiffViewerAction, registerDiffViewerActionHandlers } from "../../diffViewerActions";
import { createDiffViewerWindowStyle, diffStoryToolbarItemId } from "../../diffWindowControls";
import { storyOpenAction } from "../useDiffStory";

it("routes the menu/shortcut command to the focused viewer and exposes the toolbar button", () => {
  expect(diffHotkeyDefinitions.find(item => item.id === "changeStory")?.defaultBindings).toEqual(["Cmd+Shift+S"]);
  expect(JSON.stringify(diffMenuConfig)).toContain('"id":"changeStory"');
  const window = createDiffViewerWindowStyle({ includeFrame: false, showViewModeToolbar: true });
  expect(window.macos?.toolbar?.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: diffStoryToolbarItemId, label: "Change Story" })]));
  const open = jest.fn(() => true);
  const remove = registerDiffViewerActionHandlers("story", { changeStory: open });
  diffActiveMenuWindow$.set("story");
  expect(dispatchDiffViewerAction({ type: "action", itemId: "changeStory" })).toBe(true);
  expect(open).toHaveBeenCalledTimes(1);
  remove(); diffActiveMenuWindow$.set("main");
});

it("opens cached/running stories and generates only when needed or explicitly regenerated", () => {
  expect(storyOpenAction(true, false, false)).toBe("open");
  expect(storyOpenAction(false, true, true)).toBe("open");
  expect(storyOpenAction(false, false, false)).toBe("generate");
  expect(storyOpenAction(true, false, true)).toBe("generate");
});
