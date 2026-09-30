import { diffActiveMenuWindow$ } from "../diffMenuState";
import { dispatchDiffViewerAction, registerDiffViewerActionHandlers } from "../diffViewerActions";
test("menu actions follow the focused viewer and stale teardown preserves its replacement", () => {
  const first = jest.fn(), second = jest.fn(), replacement = jest.fn();
  const removeFirst = registerDiffViewerActionHandlers("first", { reload: first });
  const removeSecond = registerDiffViewerActionHandlers("second", { reload: second });
  diffActiveMenuWindow$.set("first");
  dispatchDiffViewerAction({ type: "action", itemId: "reload" });
  expect(first).toHaveBeenCalledTimes(1); expect(second).not.toHaveBeenCalled();
  diffActiveMenuWindow$.set("second");
  const removeReplacement = registerDiffViewerActionHandlers("second", { reload: replacement });
  removeSecond(); dispatchDiffViewerAction({ type: "action", itemId: "reload" });
  expect(replacement).toHaveBeenCalledTimes(1);
  removeReplacement(); expect(dispatchDiffViewerAction({ type: "action", itemId: "reload" })).toBe(false);
  removeFirst(); diffActiveMenuWindow$.set("main");
});
