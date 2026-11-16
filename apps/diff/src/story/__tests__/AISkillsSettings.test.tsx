import { observable } from "@legendapp/state";
import { act, fireEvent, render } from "@testing-library/react-native";
import { showWindow } from "@legendapp/spark/windows";
import { revealInFileManager } from "@legendapp/spark/files";
import { diffActiveMenuWindow$ } from "../../diffMenuState";
import { AISkillsSettings } from "../AISkillsSettings";
import { builtInStorySkills, changeStorySkill, parseStorySkill } from "../storySkill";
import { skillEditorContext$, skillPreviewTargets, skillViewerContexts$ } from "../skillRuntime";

jest.mock("@legendapp/spark/settings/window", () => {
  const { View } = require("react-native"); return { SettingsSection: View };
});
jest.mock("../skillRuntime", () => {
  const { observable } = require("@legendapp/state"); const { useValue } = require("@legendapp/state/react");
  return { skillEditorContext$: observable({}), skillViewerContexts$: observable({}), skillPreviewTargets: new Map(),
    useSkillLibrary: () => ({ library: mockLibrary, state: useValue(mockState$) }) };
});
jest.mock("@legendapp/spark/windows", () => ({ showWindow: jest.fn(async () => {}) }));
const mockState$ = observable({ entries: builtInStorySkills, active: builtInStorySkills, ready: true, errors: [] as string[] });
const userPath = "/user/skills/change-story.md";
const mockLibrary = {
  userDirectory: "/user/skills", state$: mockState$, reload: jest.fn(async () => {}),
  duplicate: jest.fn(async () => {
    const user = { ...changeStorySkill, layer: "user" as const, path: userPath };
    mockState$.set({ entries: [user, ...builtInStorySkills], active: [user, builtInStorySkills[1]], ready: true, errors: [] }); return userPath;
  }),
  save: jest.fn(async (_skill, text) => {
    const user = { ...parseStorySkill(text), layer: "user" as const, path: userPath };
    mockState$.set({ entries: [user, ...builtInStorySkills], active: [user, builtInStorySkills[1]], ready: true, errors: [] });
  }),
  restore: jest.fn(async () => mockState$.set({ entries: builtInStorySkills, active: builtInStorySkills, ready: true, errors: [] })),
};
beforeEach(() => {
  jest.clearAllMocks(); mockState$.set({ entries: builtInStorySkills, active: builtInStorySkills, ready: true, errors: [] });
  diffActiveMenuWindow$.set("viewer"); skillViewerContexts$.set({ viewer: { repoRoot: "/repo", hasDiff: true } });
  skillEditorContext$.set({ windowId: "viewer", skillName: "change-story" }); skillPreviewTargets.clear();
});
it("shows active layer badges, protects built-ins and duplicates to an editable user copy", async () => {
  const screen = await render(<AISkillsSettings />);
  expect(screen.getByText("change-story · built-in")).toBeTruthy();
  expect(screen.getByLabelText("Markdown prompt").props.editable).toBe(false);
  await fireEvent.press(screen.getByLabelText("Duplicate to edit"));
  expect(mockLibrary.duplicate).toHaveBeenCalledWith(changeStorySkill);
  expect(screen.getByLabelText("Markdown prompt").props.editable).toBe(true);
  expect(screen.getByText("change-story · user")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Markdown prompt"), "An edited **prompt**");
  await fireEvent.press(screen.getByLabelText("Save skill"));
  expect(mockLibrary.save.mock.calls[0][1]).toContain("An edited **prompt**");
  await fireEvent.press(screen.getByLabelText("Reveal in Finder"));
  expect(revealInFileManager).toHaveBeenCalledWith(userPath);
  await fireEvent.press(screen.getByLabelText("Restore built-in"));
  expect(mockLibrary.restore).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Markdown prompt").props.editable).toBe(false);
  await screen.unmount();
});
it("previews the unsaved editor draft through the current viewer without saving", async () => {
  const trySkill = jest.fn(() => true); skillPreviewTargets.set("viewer", trySkill);
  const screen = await render(<AISkillsSettings />);
  await fireEvent.press(screen.getByLabelText("Duplicate to edit"));
  await fireEvent.changeText(screen.getByLabelText("Markdown prompt"), "Try this draft");
  await fireEvent.press(screen.getByLabelText("Tool: claude"));
  await fireEvent.changeText(screen.getByLabelText("Timeout (seconds)"), "42");
  await fireEvent.press(screen.getByLabelText("Try on current diff"));
  expect(trySkill).toHaveBeenCalledWith(expect.objectContaining({ body: "Try this draft", tool: "claude", timeout: 42, layer: "user" }));
  expect(mockLibrary.save).not.toHaveBeenCalled(); expect(showWindow).toHaveBeenCalledWith("viewer");
  await fireEvent.changeText(screen.getByLabelText("Maximum diff tokens"), "0");
  await fireEvent.press(screen.getByLabelText("Save skill"));
  expect(screen.getByText(/maxDiffTokens: expected a positive integer/)).toBeTruthy();
  expect(mockLibrary.save).not.toHaveBeenCalled();
  await screen.unmount();
});
it("keeps a dirty editor when a watcher changes the file and reloads only on request", async () => {
  const screen = await render(<AISkillsSettings />);
  await fireEvent.press(screen.getByLabelText("Duplicate to edit"));
  await fireEvent.changeText(screen.getByLabelText("Markdown prompt"), "Dirty draft");
  const externallyChanged = { ...changeStorySkill, ...parseStorySkill(changeStorySkill.markdown + "External change"), layer: "user" as const, path: userPath };
  await act(() => mockState$.set({ entries: [externallyChanged, ...builtInStorySkills], active: [externallyChanged, builtInStorySkills[1]], ready: true, errors: [] }));
  expect(screen.getByLabelText("Markdown prompt").props.value).toBe("Dirty draft");
  expect(screen.getByLabelText("Save skill").props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(screen.getByLabelText("Reload from disk"));
  expect(screen.getByLabelText("Markdown prompt").props.value).toContain("External change");
  await screen.unmount();
});

it("honors an Edit skill request after another skill was selected in Settings", async () => {
  const screen = await render(<AISkillsSettings />);
  await fireEvent.press(screen.getByLabelText("change-story-detailed · built-in"));
  expect(screen.getByLabelText("Skill name").props.value).toBe("change-story-detailed");
  await act(() => skillEditorContext$.set({ windowId: "viewer", skillName: "change-story" }));
  expect(screen.getByLabelText("Skill name").props.value).toBe("change-story");
  await screen.unmount();
});
