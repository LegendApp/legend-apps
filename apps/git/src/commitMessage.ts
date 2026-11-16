export type CommitDraft = { subject: string; body: string };

/** Joins the composer fields into a commit message: one summary line, then the body after a blank line. */
export function composeMessage({ subject, body }: CommitDraft) {
  const summary = subject.replace(/\s*\n\s*/g, " ").trim();
  const rest = body.replace(/^\s*\n/, "").trimEnd();
  return rest ? `${summary}\n\n${rest}\n` : `${summary}\n`;
}

export function splitMessage(message: string): CommitDraft {
  const newline = message.indexOf("\n");
  return newline < 0 ? { subject: message, body: "" } : { subject: message.slice(0, newline), body: message.slice(newline + 1).replace(/^\n+/, "") };
}

export function commitBlocker({ subject, amend, merging = false, stagedCount, conflictCount }: { subject: string; amend: boolean; merging?: boolean; stagedCount: number; conflictCount: number }) {
  if (conflictCount) return `Resolve ${conflictCount === 1 ? "the conflicted file" : `${conflictCount} conflicted files`} and stage the result before committing.`;
  if (!amend && !merging && !stagedCount) return "Stage changes to commit them.";
  if (!subject.trim()) return "Enter a summary to commit.";
  return null;
}
