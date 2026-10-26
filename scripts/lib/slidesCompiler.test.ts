// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import { isCompilerRuntimeFile, isPackageRuntimeFile } from "./slidesCompiler";

test("compiler packaging omits maps and declarations while retaining runtime TypeScript and native modules", () => {
  for (const name of ["index.js.map", "index.d.ts", "index.d.mts", "index.d.cts", "index.d.ts.map"]) {
    expect(isCompilerRuntimeFile(name)).toBe(false);
  }
  for (const name of ["compileVirtual.ts", "index.mjs", "index.cjs", "lightningcss.node", "package.json", "LICENSE", "theme.css"]) {
    expect(isCompilerRuntimeFile(name)).toBe(true);
  }
});

test("compiler packaging keeps only the react-dom client production build", () => {
  for (const file of ["package.json", "client.js", "index.js", "cjs/react-dom-client.production.js", "cjs/react-dom.production.js"]) {
    expect(isPackageRuntimeFile("react-dom", file)).toBe(true);
  }
  for (const file of ["server.js", "cjs/react-dom-client.development.js", "cjs/react-dom-server.node.production.js", "cjs/react-dom-profiling.profiling.js"]) {
    expect(isPackageRuntimeFile("react-dom", file)).toBe(false);
  }
  expect(isPackageRuntimeFile("react", "cjs/react.development.js")).toBe(true);
});

test("packaged compiler signs as a helper bundle and compiles local worklets and Webview components", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { gunzipSync } = await import("node:zlib");
  const { packageSlidesCompiler } = await import("./slidesCompiler");
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "slides-package-test-")));
  try {
    const app = path.join(temp, "Slides.app");
    const compiler = await packageSlidesCompiler(path.join(app, "Contents/Helpers/slides-compiler.helper"));
    fs.writeFileSync(path.join(compiler, ".spark-entry"), "run");
    function checkLinks(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) expect(fs.realpathSync(file).startsWith(fs.realpathSync(compiler) + path.sep)).toBe(true);
        else if (entry.isDirectory()) checkLinks(file);
      }
    }
    checkLinks(compiler);
    const { createRequire } = await import("node:module");
    const helperRequire = createRequire(path.join(compiler, "package.json"));
    const browserRequire = createRequire(path.join(compiler, "packages/slides-web/package.json"));
    for (const name of ["react-dom/client", "@legendapp/state", "@legendapp/state/react"]) {
      expect(fs.realpathSync(browserRequire.resolve(name))).toBe(fs.realpathSync(helperRequire.resolve(name)));
    }
    if (process.platform === "darwin") {
      const { spawnSync } = await import("node:child_process");
      const { signSlidesCompiler } = await import("./slidesCompiler");
      fs.mkdirSync(path.join(app, "Contents/MacOS"), { recursive: true });
      fs.copyFileSync("/usr/bin/true", path.join(app, "Contents/MacOS/Slides"));
      fs.writeFileSync(path.join(app, "Contents/Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Slides</string><key>CFBundleIdentifier</key><string>so.legend.slides.signing-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
      signSlidesCompiler(compiler, "-");
      for (const args of [["--force", "--sign", "-", app], ["--verify", "--deep", "--strict", app]]) {
        const result = spawnSync("codesign", args, { encoding: "utf8" });
        expect(result.stderr).not.toContain("bundle format unrecognized");
        expect(result.status).toBe(0);
      }
      // No embedded runtime, so the helper bundle itself needs no JIT entitlement.
      const entitlement = spawnSync("codesign", ["-d", "--entitlements", ":-", compiler], { encoding: "utf8" });
      expect(entitlement.status).toBe(0);
      expect(entitlement.stdout).not.toContain("com.apple.security.cs.allow-jit");
    }
    expect(fs.existsSync(path.join(compiler, "runtime/compiler/dist/bin/compiler.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(compiler, "packages/slides-web/src/bootstrap.ts"))).toBe(true);
    expect(fs.existsSync(path.join(compiler, "packages/slides-web/export.ts"))).toBe(false);
    expect(fs.existsSync(path.join(compiler, "bun"))).toBe(false);
    const deck = path.join(temp, "deck.mdx");
    fs.writeFileSync(deck, '---\ntransition: fade\n---\nexport { pose } from "./pose"\n\n# Portable\n\n<Webview component="./Panel.tsx" />');
    fs.writeFileSync(path.join(temp, "pose.ts"), 'export function pose(x: number) { "worklet"; return x * 2; }');
    fs.writeFileSync(path.join(temp, "Panel.tsx"), 'import { observable } from "@legendapp/state"; import { useValue } from "@legendapp/state/react"; const label = observable("Portable webview"); export default function Panel() { return <div>{useValue(label)}</div>; }');
    // The helper ships no JavaScript runtime; exercise every runtime available on this machine.
    const runtimes = [Bun.which("bun") ?? process.execPath, Bun.which("node")].filter((runtime): runtime is string => !!runtime);
    for (const runtime of runtimes.slice(1)) {
      const viaRuntime = Bun.spawn([path.join(compiler, "run"), deck], { cwd: temp, env: { ...process.env, LEGEND_SLIDES_RUNTIME: runtime }, stdout: "pipe", stderr: "pipe" });
      const [out, err, code] = await Promise.all([new Response(viaRuntime.stdout).text(), new Response(viaRuntime.stderr).text(), viaRuntime.exited]);
      expect(err).toBe("");
      expect(code).toBe(0);
      expect(JSON.parse(gunzipSync(Buffer.from(JSON.parse(out).data, "base64")).toString())).toMatchObject({ success: true });
    }
    const child = Bun.spawn([path.join(compiler, "run"), deck], { cwd: temp, env: { ...process.env, LEGEND_SLIDES_RUNTIME: runtimes[0] }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    const result = JSON.parse(gunzipSync(Buffer.from(JSON.parse(stdout).data, "base64")).toString());
    expect(result).toMatchObject({ success: true });
    expect(result.code).toContain("__workletHash");
    expect(result.code).toContain('require("react/compiler-runtime")');
    expect(result.uniwindCode).toContain("stylesheet");
    // Both real export fixtures run with only the packaged helper and copied decks available.
    const examples = path.join(temp, "examples");
    fs.mkdirSync(path.join(examples, "templates"), { recursive: true });
    for (const file of ["demo.mdx", "Counter.tsx", "templates/Frame.tsx"]) {
      fs.copyFileSync(path.resolve(import.meta.dirname, "../../apps/slides/examples", file), path.join(examples, file));
    }
    fs.copyFileSync(path.resolve(import.meta.dirname, "../../packages/slides-effects/examples/lottie-player/example.mdx"), path.join(examples, "lottie.mdx"));
    const packs = path.join(temp, "export-effects");
    fs.cpSync(path.resolve(import.meta.dirname, "../../packages/slides-effects/packs/animation"), path.join(packs, "animation"), { recursive: true });
    for (const name of ["demo", "lottie"]) {
      const output = path.join(temp, name + "-html");
      const child = Bun.spawn([path.join(compiler, "run"), path.join(examples, name + ".mdx"), "--export-html", output, "--effect-packs", packs],
        { cwd: temp, env: { ...process.env, LEGEND_SLIDES_RUNTIME: runtimes[0], NODE_PATH: "" }, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      const exported = JSON.parse(gunzipSync(Buffer.from(JSON.parse(stdout).data, "base64")).toString());
      expect(exported).toMatchObject({ success: true, path: output, warnings: [] });
      expect(status).toBe(0);
      expect(stderr).toContain('"label":"Writing files"');
      expect(fs.readFileSync(path.join(output, "index.html"), "utf8")).not.toContain('type="module"');
      expect(fs.existsSync(path.join(output, "canvaskit.js"))).toBe(name === "lottie");
      const sources = JSON.parse(fs.readFileSync(path.join(output, "player.js.map"), "utf8")).sources;
      expect(sources.filter(file => file.endsWith("/cjs/react.production.js"))).toHaveLength(1);
      expect(sources.filter(file => /(?:@legendapp-state-[^/]+|@legendapp\/state)\/index\.[cm]?js$/.test(file))).toHaveLength(1);
    }
    const previousPlayer = fs.readFileSync(path.join(temp, "demo-html/player.js"));
    const cancelled = Bun.spawn([path.join(compiler, "run"), path.join(examples, "lottie.mdx"), "--export-html", path.join(temp, "demo-html"), "--effect-packs", packs],
      { cwd: temp, env: { ...process.env, LEGEND_SLIDES_RUNTIME: runtimes[0] }, stdout: "pipe", stderr: "pipe" });
    let progress = "";
    for await (const chunk of cancelled.stderr) {
      progress += new TextDecoder().decode(chunk);
      if (progress.includes('"label":"Bundling player"')) { cancelled.kill("SIGTERM"); break; }
    }
    expect(await cancelled.exited).not.toBe(0);
    expect(progress).toContain('"label":"Bundling player"');
    expect(fs.readFileSync(path.join(temp, "demo-html/player.js"))).toEqual(previousPlayer);
    expect(fs.readdirSync(temp).some(name => name.startsWith(".slides-export-"))).toBe(false);
    const { createHash } = await import("node:crypto");
    const manifest = {id: "optional",version:"1.0.0",hostApiVersion:1,capabilities:[],dependencies:{},exports:{Pose:"./Pose.ts"}};
    const archive = JSON.stringify({schemaVersion:1,files:{"pack.json":JSON.stringify(manifest),"Pose.ts":'export function pose(x) { "worklet"; return x * 7; }'}});
    const pin = {version:"1.0.0",sha256:createHash("sha256").update(archive).digest("hex")};
    const catalog = {schemaVersion:1,effects:[],packs:{optional:{latest:"1.0.0",versions:{"1.0.0":{...pin,url:"/pack.json",bytes:Buffer.byteLength(archive),hostApiVersion:1,capabilities:[],dependencies:{},exports:manifest.exports}}}}};
    let requests = 0;
    const server = Bun.serve({hostname:"127.0.0.1",port:0,fetch(request) {
      requests++; return new Response(new URL(request.url).pathname === "/catalog.json" ? JSON.stringify(catalog) : archive);
    }});
    try {
      const env = {...process.env,LEGEND_SLIDES_EFFECT_PACKS:path.join(temp,"effects"),LEGEND_SLIDES_EFFECTS_CATALOG:`http://127.0.0.1:${server.port}/catalog.json`};
      const install = Bun.spawn([path.join(compiler,"run"),"--effect-action","legend-slides://effects/install?pack=optional&version=1.0.0"],{cwd:temp,env,stdout:"pipe",stderr:"pipe"});
      const envelope = JSON.parse(await new Response(install.stdout).text());
      expect(JSON.parse(gunzipSync(Buffer.from(envelope.data,"base64")).toString())).toMatchObject({success:true,installed:["optional"]});
      expect(await install.exited).toBe(0);
      const offlineDeck = path.join(temp,"optional.mdx"); fs.writeFileSync(offlineDeck,'export { pose } from "slides:optional/Pose"\n\n# Offline');
      const before = requests;
      const compile = Bun.spawn([path.join(compiler,"run"),offlineDeck],{cwd:temp,env,stdout:"pipe",stderr:"pipe"});
      const compiled = JSON.parse(gunzipSync(Buffer.from(JSON.parse(await new Response(compile.stdout).text()).data,"base64")).toString());
      expect(compiled.success).toBe(true); expect(compiled.code).toContain("__workletHash");
      expect(await compile.exited).toBe(0); expect(requests).toBe(before);
      expect(JSON.parse(fs.readFileSync(offlineDeck+".effects.lock.json","utf8")).packs.optional).toEqual(pin);
    } finally { server.stop(true); }

    if (process.platform === "darwin") {
      const { spawnSync } = await import("node:child_process");
      const verified = spawnSync("codesign", ["--verify", "--deep", "--strict", app], { encoding: "utf8" });
      expect(verified.status).toBe(0);
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}, 120_000);

test("compiler bundle rejects worklets plugin changes that bypass the require.resolve rewrite", async () => {
  const { rewriteWorkletsBabelPlugins } = await import("./slidesCompilerBundle");
  expect(rewriteWorkletsBabelPlugins('require.resolve("@babel/plugin-transform-arrow-functions")')).toBe('require("@babel/plugin-transform-arrow-functions")');
  expect(() => rewriteWorkletsBabelPlugins('require.resolve("react-native-worklets/package.json")')).toThrow("no nested require.resolve");
});

test("compiler bundle rejects a worklets plugin path that no longer matches", async () => {
  const { inlineWorkletsBabelPlugins } = await import("./slidesCompilerBundle");
  let onEnd;
  inlineWorkletsBabelPlugins().setup({ onLoad() {}, onEnd(callback) { onEnd = callback; } });
  expect(onEnd().errors[0].text).toContain("not found or rewritten");
});
