import type { MenuItem } from "@legendapp/spark/context-menu";
import type { StoryTool } from "./storyRunner";
import type { StorySkill } from "./storySkill";

export type StoryViewState = "loading" | "empty" | "generating" | "failed" | "consent" | "trust" | "disabled" | "story";

/** What the Story mode shows. A story, once it exists, stays on screen while it regenerates or a prompt is pending. */
export function storyViewState({ hasResult, running, preparing, failed, consent, trust, disabled }: {
  hasResult: boolean; running: boolean; preparing: boolean; failed: boolean; consent: boolean; trust: boolean; disabled: boolean;
}): StoryViewState {
  if (hasResult) return "story";
  if (trust) return "trust";
  if (consent) return "consent";
  if (running) return "generating";
  if (failed) return "failed";
  if (preparing) return "loading";
  return disabled ? "disabled" : "empty";
}

export function storyProgressLabel(phase: string | undefined) {
  return phase === "repairing" ? "Repairing the story…" : "Writing the story…";
}

export type StoryOptionsAction = { type: "skill"; name: string } | { type: "tool"; tool: StoryTool } | { type: "editSkill" } | { type: "disable" } | { type: "enable" };

/** The Options menu: rarely changed generation settings, kept off the story view itself. */
export function storyOptionsMenu({ skills, skill, tool, running, enabled }: {
  skills: readonly StorySkill[]; skill?: StorySkill; tool: StoryTool | null; running: boolean; enabled: boolean;
}): MenuItem[] {
  const pinned = (skill?.tool ?? "auto") !== "auto";
  return [
    ...skills.map(entry => ({ type: "checkbox" as const, id: `skill:${entry.name}`, label: `${entry.name} · ${entry.layer}`, checked: entry.name === skill?.name, disabled: running })),
    ...(skills.length ? [{ type: "separator" as const }] : []),
    ...(["codex", "claude"] as const).map(value => ({ type: "checkbox" as const, id: `tool:${value}`, label: value === "codex" ? "Codex" : "Claude", checked: tool === value, disabled: running || pinned })),
    { type: "separator" },
    { type: "action", id: "editSkill", label: "Edit Skill…" },
    enabled
      ? { type: "action", id: "disable", label: "Turn Off Story Generation for This Repository", disabled: running }
      : { type: "action", id: "enable", label: "Turn On Story Generation…", disabled: running },
  ];
}

export function parseStoryOptionsAction(itemId: string): StoryOptionsAction | null {
  if (itemId.startsWith("skill:")) return { type: "skill", name: itemId.slice(6) };
  if (itemId === "tool:codex" || itemId === "tool:claude") return { type: "tool", tool: itemId.slice(5) as StoryTool };
  if (itemId === "editSkill" || itemId === "disable" || itemId === "enable") return { type: itemId };
  return null;
}
