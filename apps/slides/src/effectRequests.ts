import { observable } from "@legendapp/state";
export const effectRequests$ = observable({
  pending: null as { path: string; packs: string[] } | null,
  busy: false,
  message: "",
  error: "",
});
export function reportMissingEffects(path: string, packs: string[]) {
  const pending = effectRequests$.pending.peek();
  if (packs.length) {
    if (!pending || pending.path === path) effectRequests$.pending.set({ path, packs });
  } else if (pending?.path === path) effectRequests$.pending.set(null);
}
