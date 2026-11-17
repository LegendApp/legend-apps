import { parseStoryOptionsAction, storyOptionsMenu, storyViewState } from "../storyView";
import { changeStorySkill } from "../storySkill";

const base = { hasResult: false, running: false, preparing: false, failed: false, consent: false, trust: false, disabled: false };

it("keeps a story on screen and otherwise picks one empty, progress, failure or prompt state", () => {
  expect(storyViewState(base)).toBe("empty");
  expect(storyViewState({ ...base, preparing: true })).toBe("loading");
  expect(storyViewState({ ...base, running: true })).toBe("generating");
  expect(storyViewState({ ...base, failed: true })).toBe("failed");
  expect(storyViewState({ ...base, disabled: true })).toBe("disabled");
  expect(storyViewState({ ...base, disabled: true, consent: true })).toBe("consent");
  expect(storyViewState({ ...base, consent: true, trust: true })).toBe("trust");
  expect(storyViewState({ ...base, hasResult: true, running: true, failed: true, consent: true })).toBe("story");
});

it("builds the Options menu and maps its items back to actions", () => {
  const pinned = { ...changeStorySkill, name: "pinned", tool: "claude" as const };
  const items = storyOptionsMenu({ skills: [changeStorySkill, pinned], skill: pinned, tool: "claude", running: false, enabled: false });
  expect(items).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: "skill:pinned", checked: true }),
    expect.objectContaining({ id: "tool:codex", checked: false, disabled: true }),
    expect.objectContaining({ id: "enable", label: "Turn On Story Generation…" }),
  ]));
  expect(storyOptionsMenu({ skills: [], tool: "codex", running: true, enabled: true }).find(item => "id" in item && item.id === "disable")).toEqual(expect.objectContaining({ disabled: true }));
  expect(parseStoryOptionsAction("skill:change-story")).toEqual({ type: "skill", name: "change-story" });
  expect(parseStoryOptionsAction("tool:claude")).toEqual({ type: "tool", tool: "claude" });
  expect(parseStoryOptionsAction("disable")).toEqual({ type: "disable" });
  expect(parseStoryOptionsAction("other")).toBeNull();
});
