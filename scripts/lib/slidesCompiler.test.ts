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

test("packaged compiler signs as a helper bundle and compiles local worklets and Webview components", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { gunzipSync } = await import("node:zlib");
  const { packageSlidesCompiler } = await import("./slidesCompiler");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "slides-package-test-"));
  try {
    const app = path.join(temp, "Slides.app");
    const compiler = packageSlidesCompiler(path.join(app, "Contents/Helpers/slides-compiler.helper"));
    fs.writeFileSync(path.join(compiler, ".spark-entry"), "run");
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
      const entitlement = spawnSync("codesign", ["-d", "--entitlements", ":-", compiler], { encoding: "utf8" });
      expect(entitlement.status).toBe(0);
      expect(entitlement.stdout).toContain("com.apple.security.cs.allow-jit");
    }
    const sources = path.join(compiler, "packages/presentation/src");
    expect(fs.readdirSync(sources).sort()).toEqual(["compiler", "effectPacks", "layout.ts", "speakerNotesSource.ts", "transitions"]);
    expect(fs.readdirSync(sources, { recursive: true }).some(file => /__tests__|\.test\./.test(String(file)))).toBe(false);
    const deck = path.join(temp, "deck.mdx");
    fs.writeFileSync(deck, '---\ntransition: fade\n---\nexport { pose } from "./pose"\n\n# Portable\n\n<Webview component="./Panel.tsx" />');
    fs.writeFileSync(path.join(temp, "pose.ts"), 'export function pose(x: number) { "worklet"; return x * 2; }');
    fs.writeFileSync(path.join(temp, "Panel.tsx"), 'import { observable } from "@legendapp/state"; import { useValue } from "@legendapp/state/react"; const label = observable("Portable webview"); export default function Panel() { return <div>{useValue(label)}</div>; }');
    const child = Bun.spawn([path.join(compiler, "run"), deck], { cwd: temp, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    const result = JSON.parse(gunzipSync(Buffer.from(JSON.parse(stdout).data, "base64")).toString());
    expect(result).toMatchObject({ success: true });
    expect(result.code).toContain("__workletHash");
    expect(result.code).toContain('require("react/compiler-runtime")');
    expect(result.uniwindCode).toContain("stylesheet");
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
}, 60_000);
