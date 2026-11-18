import type { GitInteractiveRebasePlan } from "@legend-apps/git-core";
import { groupMessage, initialTodo, moveRow, setAction, setMessage, todoEntries, todoProblem, todoSummary } from "../gitInteractiveRebase";

const commit = (letter: string, subject: string, pushed = false) => ({ oid: letter.repeat(40), subject, message: `${subject}\n`, pushed });
const plan: GitInteractiveRebasePlan = { branch: "feature", base: "f".repeat(40), head: "c".repeat(40), stacked: ["lower"], refusal: null,
  commits: [commit("a", "One", true), commit("b", "Two"), commit("c", "Three")] };
const [a, b, c] = ["a", "b", "c"].map(letter => letter.repeat(40)) as [string, string, string];

it("starts with every commit picked, the newest selected and stacked branches moving", () => {
  const state = initialTodo(plan);
  expect(state).toMatchObject({ selected: 2, messages: {}, updateRefs: true });
  expect(state.rows.map(row => [row.subject, row.action])).toEqual([["One", "pick"], ["Two", "pick"], ["Three", "pick"]]);
  expect(todoEntries(state)).toEqual([{ oid: a, action: "pick" }, { oid: b, action: "pick" }, { oid: c, action: "pick" }]);
  expect(todoSummary(state)).toBe("Nothing changes yet. Choose what to do with each commit, or move it.");
  expect(groupMessage(state)).toBeNull();
  expect(initialTodo({ ...plan, stacked: [] }).updateRefs).toBe(false);
});

it("moves rows, keeping the moved row selected", () => {
  let state = moveRow(initialTodo(plan), 2, -1);
  expect(state.rows.map(row => row.subject)).toEqual(["One", "Three", "Two"]);
  expect(state.selected).toBe(1);
  expect(moveRow(state, 2, 1)).toBe(state);
  state = moveRow(state, 0, 1);
  expect(state.rows.map(row => row.subject)).toEqual(["Three", "One", "Two"]);
  expect(todoSummary(state)).toBe("3 commits after the rebase: reordered.");
});

it("edits a reword's message and a squash group's joined message on its first commit", () => {
  let state = setAction(initialTodo(plan), 1, "reword");
  expect(groupMessage(state)).toEqual({ oid: b, subject: "Two", message: "Two" });
  // Unedited, a reword keeps its message (git-core leaves it as it is).
  expect(todoEntries(state)[1]).toEqual({ oid: b, action: "reword" });
  state = setMessage(state, b, "Two, reworded");
  expect(todoEntries(state)[1]).toEqual({ oid: b, action: "reword", message: "Two, reworded" });
  expect(todoSummary(state)).toBe("3 commits after the rebase: 1 reworded.");

  state = setAction(initialTodo(plan), 2, "squash");
  expect(groupMessage(state)).toEqual({ oid: b, subject: "Two", message: "Two\n\nThree" });
  expect(groupMessage(state, 1)).toEqual(groupMessage(state));
  state = setAction(state, 1, "fixup");
  // Two now fixes up One, so the group starts at One; fixups add no message.
  expect(groupMessage(state)).toEqual({ oid: a, subject: "One", message: "One\n\nThree" });
  state = setMessage(state, a, "All three");
  expect(todoEntries(state)).toEqual([{ oid: a, action: "pick", message: "All three" }, { oid: b, action: "fixup" }, { oid: c, action: "squash" }]);
  expect(todoSummary(state)).toBe("1 commit after the rebase: 2 joined.");
  // A fixup-only group has nothing to edit.
  expect(groupMessage(setAction(initialTodo(plan), 2, "fixup"))).toBeNull();
});

it("says why the todo can't start", () => {
  expect(todoProblem(setAction(initialTodo(plan), 0, "squash"))).toBe("“One” can’t be squashed or fixed up: there’s no commit kept above it to join.");
  expect(todoProblem(setAction(setAction(initialTodo(plan), 0, "drop"), 1, "fixup"))).toBe("“Two” can’t be squashed or fixed up: there’s no commit kept above it to join.");
  expect(todoProblem(setMessage(setAction(initialTodo(plan), 1, "reword"), b, "  "))).toBe("Enter a message for “Two”.");
  expect(todoProblem(setAction(initialTodo(plan), 0, "drop"))).toBeNull();
  expect(todoSummary(setAction(initialTodo(plan), 0, "drop"))).toBe("2 commits after the rebase: 1 dropped.");
});
