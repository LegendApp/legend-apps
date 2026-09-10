export type GitStatusPartition = {
  releaseChanges: string[];
  unexpectedChanges: string[];
};

function getStatusPath(statusLine: string) {
  const path = statusLine.slice(3);
  const renameSeparatorIndex = path.lastIndexOf(" -> ");
  return renameSeparatorIndex >= 0 ? path.slice(renameSeparatorIndex + 4) : path;
}

export function partitionGitStatus(status: string, releasePaths: readonly string[]): GitStatusPartition {
  const releasePathSet = new Set(releasePaths);
  const releaseChanges: string[] = [];
  const unexpectedChanges: string[] = [];

  for (const statusLine of status.split("\n").filter(Boolean)) {
    if (releasePathSet.has(getStatusPath(statusLine))) {
      releaseChanges.push(statusLine);
    } else {
      unexpectedChanges.push(statusLine);
    }
  }

  return { releaseChanges, unexpectedChanges };
}
