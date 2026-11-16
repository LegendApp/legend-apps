import type { GitRepoState } from "./GitService";

export function getDiffRepoStateBanner(state: GitRepoState): string | null {
  const states = [
    state.merging && "Merging",
    state.rebasing && "Rebasing",
    state.cherryPicking && "Cherry-picking",
    state.reverting && "Reverting",
    state.bisecting && "Bisecting",
    state.detached && "Detached HEAD",
  ].filter(Boolean);
  if (states.length === 0) return null;
  const location = state.branch ?? state.detachedCommit?.slice(0, 8);
  return `${states.join(" · ")}${location ? ` — ${location}` : ""}`;
}
