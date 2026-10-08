import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../PresenterWindow.tsx", import.meta.url));
const { transformSync } = require("@babel/core");
for (const [file, hook] of [["PresenterWindow", "useDisplayRolesSetting"], ["NotesWindow", "useNotesPreviewRatioSetting"], ["TransitionSettingsPage", "useTitleAnimationSpeedSetting"], ["ScrollableNotes", "usePresenterTextColorSetting"], ["ScrollableNotes", "usePresenterInactiveColorSetting"], ["SettingsWindow", "usePresenterTextColorSetting"], ["SettingsWindow", "usePresenterInactiveColorSetting"]]) {
  test(`${file} settings hook remains unconditional after React compilation`, () => {
    const filename = fileURLToPath(new URL(`../${file}.tsx`, import.meta.url));
    const source = readFileSync(filename, "utf8");
    assert.doesNotMatch(source, /Setting\.use\(\)/);
    const { ast } = transformSync(source, {
      filename, babelrc: false, configFile: false, ast: true,
      presets: [require.resolve("@react-native/babel-preset")],
      plugins: [[require.resolve("babel-plugin-react-compiler"), { target: "19" }]],
    });
    let calls = 0;
    function visit(node, conditional = false) {
      if (!node || typeof node !== "object") return;
      if (node.type === "CallExpression") {
        const callee = node.callee.type === "SequenceExpression" ? node.callee.expressions.at(-1) : node.callee;
        if (callee.name === hook || callee.property?.name === hook) {
          calls++;
          assert.equal(conditional, false, "compiler must not put the hook behind a memo cache guard");
        }
      }
      const next = conditional || ["IfStatement", "ConditionalExpression"].includes(node.type);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => visit(child, next));
        else if (value && typeof value === "object") visit(value, next);
      }
    }
    visit(ast);
    assert.equal(calls, 1);
  });
}
