// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import { parseEffectAction } from "../../../../packages/presentation/src/effectPacks/protocol";
test("gallery links address exact pack versions or known example IDs", () => {
  expect(parseEffectAction("legend-slides://effects/install?pack=materials&version=1.0.0")).toEqual({type: "install",pack: "materials",version: "1.0.0"});
  expect(parseEffectAction("legend-slides://effects/example?effect=glass-strike")).toEqual({type: "example",effect: "glass-strike"});
  for (const link of ["https://example.com/install?pack=materials", "legend-slides://other/install?pack=materials&version=1.0.0",
    "legend-slides://effects/install?pack=../outside&version=1.0.0", "legend-slides://effects/install?pack=materials&version=latest",
    "legend-slides://effects/example?effect=glass-strike&effect=other", "legend-slides://effects/example?effect=%00"])
    expect(() => parseEffectAction(link)).toThrow();
});
