// @ts-nocheck This suite uses Bun test globals.
import { expect, test } from "bun:test";
import { assignDisplayRole, displayKey } from "../displayRoles";

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
