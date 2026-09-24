// @ts-nocheck This suite uses Bun test globals.
import { expect, test } from "bun:test";
import { assignDisplayRole, displayKey, rememberDisplayRoles, resolveDisplayRoles } from "../displayRoles";

test("one assigned output becomes audience, while disconnected assignments retain their roles", () => {
  expect(assignDisplayRole({ audience: null, notes: null }, "a", "notes")).toEqual({ audience: "a", notes: null });
  expect(assignDisplayRole({ audience: "offline", notes: null }, "b", "notes")).toEqual({ audience: "offline", notes: "b" });
  expect(assignDisplayRole({ audience: "a", notes: "b" }, "a", "unused")).toEqual({ audience: "b", notes: null });
});
test("roles stay exclusive and use hardware identity rather than screen order/session ID", () => {
  expect(assignDisplayRole({ audience: "a", notes: "b" }, "b", "audience")).toEqual({ audience: "b", notes: null });
  expect(displayKey({ id: "1", persistentId: "hardware" })).toBe(displayKey({ id: "99", persistentId: "hardware" }));
  expect(displayKey({ id: "old-binary" })).toBe("old-binary");
});

test("restores local and external setups independently across reconnects and restarts", () => {
  const laptop = { id: "1", persistentId: "mac", isMain: true };
  const ipad = { id: "2", persistentId: "ipad", isMain: false };
  const local = { audience: "mac", notes: null };
  let history = rememberDisplayRoles({}, [laptop], local);
  const external = resolveDisplayRoles([laptop, ipad], [laptop], local, history);
  expect(external).toEqual({ audience: "ipad", notes: null });
  history = rememberDisplayRoles(history, [laptop, ipad], { audience: "ipad", notes: "mac" });
  expect(resolveDisplayRoles([laptop], [laptop, ipad], external, history)).toEqual(local);
  expect(resolveDisplayRoles([{ ...ipad, id: "99" }, laptop], [], local, history))
    .toEqual({ audience: "ipad", notes: "mac" });
});
test("new setups default to newly attached displays and history retains manual choices", () => {
  const laptop = { id: "mac", isMain: true };
  const external = { id: "projector", isMain: false };
  const roles = { audience: "mac", notes: null };
  expect(resolveDisplayRoles([laptop, external], [laptop], roles, {})).toEqual({ audience: "projector", notes: null });
  const history = rememberDisplayRoles({}, [laptop, external], roles);
  expect(resolveDisplayRoles([laptop, external], [laptop], roles, history)).toEqual(roles);
  expect(resolveDisplayRoles([laptop, external], [], roles, {})).toEqual({ audience: "projector", notes: null });
});
