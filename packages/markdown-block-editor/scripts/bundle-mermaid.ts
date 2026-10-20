import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

// Run with bun after updating the pinned Mermaid dependency. Keep the browser
// runtime local so document rendering never needs a server or network access.
const require = createRequire(import.meta.url);
const runtime = readFileSync(require.resolve("mermaid/dist/mermaid.min.js"), "utf8");
writeFileSync(new URL("../src/mermaidRuntime.json", import.meta.url), JSON.stringify(runtime) + "\n");
writeFileSync(
  new URL("../src/mermaid-LICENSE", import.meta.url),
  readFileSync(require.resolve("mermaid/LICENSE")),
);
