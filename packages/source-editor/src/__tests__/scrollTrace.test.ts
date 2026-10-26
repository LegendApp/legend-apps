import { createScrollTrace } from "../scrollTrace";

test("scroll capture is disabled by default and preserves originating times/order", () => {
  const trace = createScrollTrace();
  trace.record("ignored", {});
  expect(JSON.parse(trace.drain()).events).toEqual([]);
  trace.enable();
  const now = jest.spyOn(Date, "now").mockReturnValue(1234);
  trace.record("js-scroll", { y: 500 });
  now.mockReturnValue(1240);
  trace.record("js-row-commit", { lineId: "20" });
  expect(JSON.parse(trace.drain())).toEqual({ events: [
    { timestamp: 1234, seq: 1, event: "js-scroll", fields: { y: 500 } },
    { timestamp: 1240, seq: 2, event: "js-row-commit", fields: { lineId: "20" } },
  ], dropped: 0 });
  now.mockRestore();
  expect(JSON.parse(trace.drain()).events).toEqual([]);
});

test("scroll capture bounds memory, reports overflow and cleans up", () => {
  const trace = createScrollTrace(); trace.enable();
  for (let i = 0; i < 5000; i++) trace.record("js-row-commit", { line: i });
  const batch = JSON.parse(trace.drain());
  expect(batch.events).toHaveLength(4000); expect(batch.dropped).toBe(1000);
  expect(JSON.parse(trace.drain())).toEqual({ events: [], dropped: 0 });
  trace.record("pending", {}); trace.stop(); trace.record("ignored", {});
  expect(trace.enabled).toBe(false);
  expect(JSON.parse(trace.drain())).toEqual({ events: [], dropped: 0 });
});
