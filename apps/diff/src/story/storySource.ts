import type { DiffOpenSource } from "../diffFiles";

export type StorySource = { type: "working_tree" | "git_range" | "pull_request" | "commit" | "patch"; base?: string; head?: string };

function rangeSource(range: string): StorySource {
  const match = /^(.*?)\.{2,3}(.*)$/.exec(range);
  return { type: "git_range", base: match?.[1] || "HEAD", head: match?.[2] || "HEAD" };
}

export function getStorySource(source: DiffOpenSource): StorySource {
  switch (source.kind) {
    case "folder": return { type: "working_tree", base: source.compareBase?.kind === "ref" ? source.compareBase.ref : "HEAD", head: "WORKTREE" };
    case "index-vs-workdir": return { type: "working_tree", base: "INDEX", head: "WORKTREE" };
    case "head-vs-index": return { type: "working_tree", base: "HEAD", head: "INDEX" };
    case "commit": return { type: "commit", base: `${source.sha}^`, head: source.sha };
    case "range": return rangeSource(source.range);
    case "github": {
      const parts = new URL(source.value).pathname.split("/");
      return parts[3] === "commit" ? { type: "commit", head: parts[4] } : { type: "pull_request", head: source.value };
    }
    case "filePair": return { type: "patch", base: source.oldPath, head: source.newPath };
    case "diffFile": return { type: "patch" };
    case "git": {
      const revisions: string[] = [];
      const takesValue = new Set(["-U", "--unified", "--src-prefix", "--dst-prefix", "--output", "--diff-filter", "-S", "-G", "-O"]);
      for (let i = 0; i < source.args.length && source.args[i] !== "--"; i++) {
        const arg = source.args[i];
        if (takesValue.has(arg)) i++;
        else if (!arg.startsWith("-")) revisions.push(arg);
      }
      if (revisions[0]?.includes("..")) return rangeSource(revisions[0]);
      if (revisions.length >= 2) return { type: "git_range", base: revisions[0], head: revisions[1] };
      return { type: "working_tree", base: revisions[0] ?? (source.args.some(arg => arg === "--cached" || arg === "--staged") ? "HEAD" : "INDEX"),
        head: source.args.some(arg => arg === "--cached" || arg === "--staged") ? "INDEX" : "WORKTREE" };
    }
  }
}

export function getStoryCwd(source: DiffOpenSource, repoRoot?: string) {
  if (source.kind === "folder") return repoRoot ?? source.value;
  if ("cwd" in source) return repoRoot ?? source.cwd;
  return undefined;
}

export function getStoryScope(source: DiffOpenSource, repoRoot?: string) {
  const cwd = getStoryCwd(source, repoRoot);
  return cwd ? `repo:${cwd.replace(/\/+$/, "")}` : `source:${source.kind}:${source.value}`;
}
