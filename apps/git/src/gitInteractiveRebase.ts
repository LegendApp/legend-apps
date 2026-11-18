import type { GitInteractiveRebasePlan, GitTodoAction, GitTodoCommit, GitTodoEntry } from "@legend-apps/git-core";

/** One row of the interactive rebase sheet: a commit and what the rebase does with it. */
export type TodoRow = GitTodoCommit & { action: GitTodoAction };
/** The sheet's state: rows in todo order (oldest first), the selected row, edited group messages by their first commit, and `--update-refs`. */
export type TodoState = { rows: TodoRow[]; original: string[]; selected: number; messages: Record<string, string>; updateRefs: boolean };

export const todoActions: readonly { value: GitTodoAction; label: string }[] = [
  { value: "pick", label: "Pick" }, { value: "reword", label: "Reword" }, { value: "squash", label: "Squash" }, { value: "fixup", label: "Fixup" }, { value: "drop", label: "Drop" },
];

/** Every commit picked, in order, the newest selected; stacked branches move along. */
export const initialTodo = (plan: GitInteractiveRebasePlan): TodoState => ({
  rows: plan.commits.map(commit => ({ ...commit, action: "pick" })), original: plan.commits.map(commit => commit.oid), selected: plan.commits.length - 1, messages: {}, updateRefs: plan.stacked.length > 0,
});

const joins = (action: GitTodoAction) => action === "squash" || action === "fixup" || action === "drop";

/** The rows of the group row `index` belongs to: the pick or reword before it and the squash, fixup and drop rows after that. */
export function groupOf(rows: readonly TodoRow[], index: number) {
  let start = index;
  while (start > 0 && joins(rows[start]!.action)) start -= 1;
  let end = start;
  while (end + 1 < rows.length && joins(rows[end + 1]!.action)) end += 1;
  return { start, end };
}

/**
 * The message the selected row's group ends up with, when the sheet lets it be edited (a reword, or a group that squashes):
 * the edit, else the message (a squash's joined with the ones it squashes, as Git does). Null for anything else.
 */
export function groupMessage(state: TodoState, index = state.selected) {
  const row = state.rows[index];
  if (!row || row.action === "drop") return null;
  const { start, end } = groupOf(state.rows, index);
  const head = state.rows[start]!, group = state.rows.slice(start, end + 1);
  if (joins(head.action) || (head.action !== "reword" && !group.some(entry => entry.action === "squash"))) return null;
  const message = state.messages[head.oid] ?? group.filter(entry => entry === head || entry.action === "squash").map(entry => entry.message.trimEnd()).join("\n\n");
  return { oid: head.oid, subject: head.subject, message };
}

/** Sets row `index`'s action and selects it. */
export function setAction(state: TodoState, index: number, action: GitTodoAction): TodoState {
  return { ...state, rows: state.rows.map((row, at) => at === index ? { ...row, action } : row), selected: index };
}

/** Moves row `index` up (-1) or down (+1), keeping it selected. */
export function moveRow(state: TodoState, index: number, delta: -1 | 1): TodoState {
  const to = index + delta;
  if (to < 0 || to >= state.rows.length) return state;
  const rows = [...state.rows];
  [rows[index], rows[to]] = [rows[to]!, rows[index]!];
  return { ...state, rows, selected: state.selected === index ? to : state.selected };
}

export function setMessage(state: TodoState, oid: string, message: string): TodoState {
  return { ...state, messages: { ...state.messages, [oid]: message } };
}

/** Why the todo can't start, or null. */
export function todoProblem(state: TodoState) {
  const first = state.rows.find(row => row.action !== "drop");
  if (first && joins(first.action)) return `“${first.subject}” can’t be squashed or fixed up: there’s no commit kept above it to join.`;
  const message = state.rows.map((_, index) => groupMessage(state, index)).find(group => group && !group.message.trim());
  return message ? `Enter a message for “${message.subject}”.` : null;
}

/** The todo for GitService.interactiveRebase: edited messages go on each group's first row. */
export const todoEntries = (state: TodoState): GitTodoEntry[] => state.rows.map((row, index) => {
  const group = groupMessage(state, index);
  return { oid: row.oid, action: row.action, ...group && group.oid === row.oid && state.messages[row.oid] !== undefined ? { message: group.message } : {} };
});

/** A short line for the sheet saying what the todo does. */
export function todoSummary(state: TodoState) {
  const count = (action: GitTodoAction) => state.rows.filter(row => row.action === action).length;
  const moved = state.rows.some((row, index) => row.oid !== state.original[index]);
  const parts = [moved ? "reordered" : "", count("reword") ? `${count("reword")} reworded` : "", count("squash") + count("fixup") ? `${count("squash") + count("fixup")} joined` : "", count("drop") ? `${count("drop")} dropped` : ""].filter(Boolean);
  const left = state.rows.length - count("drop") - count("squash") - count("fixup");
  return parts.length ? `${left} commit${left === 1 ? "" : "s"} after the rebase: ${parts.join(", ")}.` : "Nothing changes yet. Choose what to do with each commit, or move it.";
}
