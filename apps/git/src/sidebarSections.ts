import type { GitSettings } from "./settings/schema";
import type { Section } from "./commands";

export type SidebarSectionId = GitSettings["sidebar"]["sections"][number]["id"];

/** A section with more items than this starts collapsed unless the settings or the user expanded it. */
export const largeSection = 20;

/**
 * The sections the sidebar shows, in the settings' order: one left out or `visible: false` is hidden. A section is
 * expanded as the user last left it in this window, else as the settings say, else unless it is large.
 */
export function sidebarSections(settings: GitSettings["sidebar"], counts: Partial<Record<SidebarSectionId, number>>, expanded: Partial<Record<string, boolean>>) {
  const seen = new Set<SidebarSectionId>();
  return settings.sections.flatMap(entry => {
    if (seen.has(entry.id) || entry.visible === false) return [];
    seen.add(entry.id);
    return [{ id: entry.id, expanded: expanded[entry.id] ?? entry.expanded ?? (counts[entry.id] ?? 0) <= largeSection }];
  });
}

/** The section a sidebar row belongs to, by its id (see the `Section` ids). */
export function sectionOfRow(id: Section | string): SidebarSectionId | null {
  if (id === "changes" || id === "history") return "workspace";
  if (id.startsWith("review:")) return "reviewQueue";
  if (id.startsWith("ref:refs/heads/")) return "branches";
  if (id.startsWith("ref:refs/remotes/")) return "remotes";
  if (id.startsWith("ref:refs/tags/")) return "tags";
  if (id.startsWith("stash:")) return "stashes";
  if (id.startsWith("worktree:")) return "worktrees";
  if (id.startsWith("pr:") || id === "github-sign-in") return "pullRequests";
  return null;
}
