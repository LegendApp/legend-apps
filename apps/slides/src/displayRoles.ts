import type { Display } from "@legendapp/spark/windows/managed";
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

export type DisplayRoleHistory = Record<string, DisplayRoles>;
export function displaySetupKey(displays: Display[]) {
  return JSON.stringify(displays.map(displayKey).sort());
}
export function rememberDisplayRoles(history: DisplayRoleHistory, displays: Display[], roles: DisplayRoles): DisplayRoleHistory {
  if (!displays.length) return history;
  const key = displaySetupKey(displays);
  // Keep the most recent 5 setups, including single-screen rehearsal.
  const entries = Object.entries(history).filter(([saved]) => saved !== key).slice(-4);
  return Object.fromEntries([...entries, [key, roles]]);
}
export function resolveDisplayRoles(displays: Display[], previous: Display[], current: DisplayRoles, history: DisplayRoleHistory): DisplayRoles {
  const saved = history[displaySetupKey(displays)];
  if (saved) return saved;
  const connected = (key: string | null) => displays.find(d => displayKey(d) === key || d.id === key);
  const added = previous.length ? displays.find(d => !previous.some(old => displayKey(old) === displayKey(d))) : undefined;
  const audience = added ?? (previous.length ? connected(current.audience) : undefined)
    ?? displays.find(d => !d.isMain) ?? displays[0];
  const notes = connected(current.notes);
  return { audience: audience ? displayKey(audience) : null,
    notes: notes && notes !== audience ? displayKey(notes) : null };
}
