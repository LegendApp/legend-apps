import type { GitReadOptions, GitService } from "./GitService";
import { getGitService } from "./sparkGitService";

export async function readDiffGitSource(
  source: GitSource,
  options: GitReadOptions & { ignoreWhitespaceChanges?: boolean } = {},
  service?: GitService,
) {
  const git = service ?? getGitService(source.cwd);
  const whitespace = options.ignoreWhitespaceChanges ? ["--ignore-all-space"] : [];
  if (source.kind === "git") return git.diff([...whitespace, ...source.args], options);
  if (source.kind === "commit") return git.showCommit(source.sha, options);
  const args = ["--no-ext-diff", "--no-color", ...whitespace];
  if (source.kind === "head-vs-index") args.push("--cached");
  if (source.kind === "range") args.push(source.range);
  args.push("--");
  return git.diff(args, { ...options, requiresIndex: source.kind !== "range" });
}

export type DiffGitComparison =
  | { kind: "index-vs-workdir" }
  | { kind: "head-vs-index" }
  | { kind: "commit"; sha: string }
  | { kind: "range"; range: string };

export type DiffGitOpenSource = DiffGitComparison & {
  cwd: string;
  label: string;
  value: string;
};

export type GitCommandSource = {
  args: string[];
  cwd: string;
  kind: "git";
  label: string;
  value: string;
};

export type GitSource = DiffGitOpenSource | GitCommandSource;

export function createDiffGitSource(cwd: string, comparison: DiffGitComparison): DiffGitOpenSource {
  const target = comparison.kind === "commit" ? comparison.sha
    : comparison.kind === "range" ? comparison.range : comparison.kind;
  const label = comparison.kind === "index-vs-workdir" ? "Worktree vs Index"
    : comparison.kind === "head-vs-index" ? "Index vs HEAD"
    : comparison.kind === "commit" ? `Commit ${comparison.sha.slice(0, 12)}` : comparison.range;
  return { ...comparison, cwd, label, value: `${cwd} ${target}` };
}

export function isDiffGitSource(source: { kind: string }): source is GitSource {
  return source.kind === "git" || source.kind === "index-vs-workdir" || source.kind === "head-vs-index"
    || source.kind === "commit" || source.kind === "range";
}
