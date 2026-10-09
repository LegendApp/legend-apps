import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileDeck } from "../../presentation/src/compiler";

test("compiled number timing captures functions without cyclic host modules", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "music-number-worklet-"));
  try {
    const deck = path.join(directory, "deck.mdx");
    fs.writeFileSync(deck, 'export { numberFlowTiming } from "slides:charts/NumberTiming"\n\n# Numbers');
    const compiled = await compileDeck(deck);
    if (!compiled.success) throw new Error(compiled.errors.join("\n"));
    const presentation: any = { samplePlayback: (clock: any) => clock.stepTime };
    const reanimated: any = { defineAnimation: (_: number, factory: () => unknown) => factory() };
    presentation.self = presentation;
    reanimated.self = reanimated;
    const module = { exports: {} as any };
    Function("require", "module", "exports", compiled.code)((name: string) => {
      if (name === "@legend-apps/presentation") return presentation;
      if (name === "react-native-reanimated") return reanimated;
      return {};
    }, module, module.exports);
    function restore(fn: any): any {
      if (!fn.__workletHash) return fn;
      const closure = Object.fromEntries(Object.entries(fn.__closure).map(([key, value]) => {
        assert.notEqual(value, presentation);
        assert.notEqual(value, reanimated);
        return [key, typeof value === "function" ? restore(value) : value];
      }));
      return Function(`return (${fn.__initData.code});`)().bind({ __closure: closure });
    }
    const clock = { value: { slideKey: "music", stepKey: "corrected", phase: "playing", stepTime: 0.55 } };
    const driver = restore(module.exports.numberFlowTiming(clock));
    const animation = driver(15.4, { duration: 1100, easing: (x: number) => x });
    animation.onStart(animation, 35.3);
    assert.equal(animation.onFrame(animation), false);
    assert.ok(Math.abs(animation.current - 25.35) < 0.001);
    clock.value.stepTime = 1.1;
    assert.equal(animation.onFrame(animation), true);
    assert.equal(animation.current, 15.4);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
