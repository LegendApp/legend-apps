import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.includes("--help") || args.length !== 2 || args[0] !== "--output") {
  console.log("Usage: bun packages/slides-effects/scripts/world-benchmark.mjs --output /absolute/path/harness.html\nGenerates a standalone offline WebGPU measurement page. In Chrome, call await benchmarkWorld({width:1920,height:1080,quality:'high'}). Add allEffects:true for the full scene, quality:'auto',paced:true for the shared adaptive controller (unpaced auto stays high/manual), renderScale:0.75 for a manual scale, or paced:true for rAF interval measurements (without GPU timestamp readback).\nResult includes raw samples, per-pass GPU timestamps when available, completed-submit wall times and a PNG data URL.\nGenerate and launch the browser through the heavy gate; call the measurement through the fps gate. Keep generated pages/results outside the repository.");
  process.exit(args.includes("--help") ? 0 : 2);
}
const output = resolve(args[1]);
const result = await Bun.build({ entrypoints: [fileURLToPath(new URL("./worldBenchmark.ts", import.meta.url))], target: "browser" });
if (!result.success) throw new AggregateError(result.logs, "World benchmark bundling failed");
const code = (await result.outputs[0].text()).replaceAll("</script", "<\\/script");
await mkdir(dirname(output), { recursive: true });
await Bun.write(output, `<!doctype html><html><meta charset="utf-8"><title>World render benchmark</title><style>html,body{margin:0;background:#05060a;color:white;font-family:system-ui}</style><body><p>Ready. Call benchmarkWorld({width:1920,height:1080,quality:"high"}) from DevTools.</p><script type="module">${code}</script></body></html>`);
console.log(output);
