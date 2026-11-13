import type { DiffOpenSource } from "../diffFiles";
import { getGitService, type GitReadOptions, type GitService } from "./GitService";

export async function readDiffGitSource(
  source: Extract<DiffOpenSource, { cwd: string }>,
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
  return git.diff(args, options);
}
