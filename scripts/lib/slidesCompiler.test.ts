// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import { isCompilerRuntimeFile } from "./slidesCompiler";

test("compiler packaging omits maps and declarations while retaining runtime TypeScript and native modules", () => {
  for (const name of ["index.js.map", "index.d.ts", "index.d.mts", "index.d.cts", "index.d.ts.map"]) {
    expect(isCompilerRuntimeFile(name)).toBe(false);
  }
  for (const name of ["compileVirtual.ts", "index.mjs", "index.cjs", "lightningcss.node", "package.json", "LICENSE", "theme.css"]) {
    expect(isCompilerRuntimeFile(name)).toBe(true);
  }
});
