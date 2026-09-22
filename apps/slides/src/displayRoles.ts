import type { Display } from "@legend-apps/window-manager";
export type DisplayRoles = { audience: string | null; notes: string | null };
export function displayKey(display: Pick<Display, "id" | "persistentId">) { return display.persistentId || display.id; }
export function assignDisplayRole(roles: DisplayRoles, key: string, role: "audience" | "notes" | "unused"): DisplayRoles {
  const next = { ...roles };
  if (next.audience === key) next.audience = null;
  if (next.notes === key) next.notes = null;
  if (role !== "unused") next[role] = key;
  // Only one assigned output is always the audience. Missing outputs are still assigned.
  if (!next.audience && next.notes) { next.audience = next.notes; next.notes = null; }
  return next;
}
