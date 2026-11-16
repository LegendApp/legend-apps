export function uniqueValues(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export const gitRefFormat = "%(refname)%09%(HEAD)%09%(upstream:short)%09%(symref:short)";
const localRefPrefix = "refs/heads/";
const remoteRefPrefix = "refs/remotes/";

export function parseDiffCompareRepoRefs(value: string | null) {
  let currentBranch: string | null = null;
  let defaultBranch: string | null = null;
  let upstreamBranch: string | null = null;
  const localBranches: string[] = [];
  const remoteBranches: string[] = [];

  for (const line of value?.split("\n") ?? []) {
    const [refName = "", head = "", upstream = "", symref = ""] = line.split("\t");
    if (refName.startsWith(localRefPrefix)) {
      const branch = refName.slice(localRefPrefix.length);
      localBranches.push(branch);
      if (head === "*") {
        currentBranch = branch;
        upstreamBranch = upstream || null;
      }
    } else if (refName.startsWith(remoteRefPrefix)) {
      const branch = refName.slice(remoteRefPrefix.length);
      remoteBranches.push(branch);
      if (refName === "refs/remotes/origin/HEAD") {
        defaultBranch = symref || null;
      }
    }
  }

  return {
    currentBranch,
    defaultBranch,
    localBranches: uniqueValues(localBranches),
    remoteBranches: uniqueValues(remoteBranches),
    upstreamBranch,
  };
}
