import { createSourceProgress, progressLabel } from "../sourceProgress";

describe("large source file progress", () => {
  it("hides small files and completed highlighting", () => {
    expect(progressLabel({ completedLines: 0, totalLines: 9999, active: true }, true)).toBeNull();
    expect(progressLabel({ completedLines: 10000, totalLines: 10000, active: false }, false)).toBeNull();
  });
  it("shows loaded line count rather than a misleading percentage while reading", () => {
    const label = progressLabel({ completedLines: 8000, totalLines: 10000, active: true }, true);
    expect(label).toContain("Loading file");
    expect(label).not.toContain("%");
  });
  it("shows bounded highlighting percentages once the file is loaded", () => {
    expect(progressLabel({ completedLines: 5000, totalLines: 10000, active: true }, false)).toContain("50%");
    expect(progressLabel({ completedLines: 12000, totalLines: 10000, active: true }, false)).toContain("99%");
  });
  it("publishes only changes and removes subscriptions", () => {
    const progress = createSourceProgress();
    const listener = jest.fn(); const unsubscribe = progress.subscribe(listener);
    const value = { completedLines: 1, totalLines: 10000, active: true };
    progress.update(value); progress.update({ ...value });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(progress.getSnapshot()).toBe(value);
    unsubscribe(); progress.update({ completedLines: 10000, totalLines: 10000, active: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
