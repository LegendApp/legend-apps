import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { catalog, queryFor, root, sourceDirectory, validateCatalog } from "./catalog";

validateCatalog();
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("Usage: bun run grammars:release [--version VERSION] [--arch arm64|x86_64|all] [--language NAME|all] [--output PATH] [--dry-run | --publish]");
  process.exit(0);
}
for (let i = 0; i < args.length; i++) {
  if (["--version", "--arch", "--language", "--output"].includes(args[i])) { i++; continue; }
  if (!["--dry-run", "--publish"].includes(args[i])) throw Error(`Unknown release option: ${args[i]}`);
}
function option(name: string, fallback: string) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith("--")) throw Error(`Missing ${name}`);
  return args[i + 1];
}
const publish = args.includes("--publish");
if (publish && args.includes("--dry-run")) throw Error("--publish and --dry-run are mutually exclusive");
const version = option("--version", "local");
if (!/^[a-z0-9][a-z0-9.-]*$/.test(version)) throw Error("Invalid release version");
const arch = option("--arch", "all");
if (!["all", "arm64", "x86_64"].includes(arch)) throw Error("Expected --arch arm64, x86_64, or all");
const selected = option("--language", "all");
const requested = new Set<string>();
function include(name: string) {
  const g = catalog.grammars.find((g) => g.name === name);
  if (!g) throw Error(`Unknown grammar: ${name}`);
  if (requested.has(name)) return;
  requested.add(name); g.dependencies.forEach(include);
}
if (selected === "all") catalog.grammars.forEach((g) => include(g.name)); else include(selected);
const grammars = catalog.grammars.filter((g) => requested.has(g.name));
if (!grammars.length) throw Error("No matching grammar");
const tag = `grammars-v${version}`;
const output = resolve(option("--output", join(root, `.legend/grammars/${version}`)));
const identity = process.env.LEGEND_GRAMMAR_SIGN_IDENTITY;
const run = (command: string, argv: string[]) => execFileSync(command, argv, { cwd: root, stdio: "inherit" });
const capture = (command: string, argv: string[]) => execFileSync(command, argv, { cwd: root, encoding: "utf8" }).trim();
if (publish) {
  if (version === "local" || !identity || selected !== "all" || arch !== "all") throw Error("Publishing requires a version, signing identity, and the complete architecture/language matrix");
  if (capture("git", ["status", "--porcelain"])) throw Error("Publishing requires a clean checkout");
  if (!capture("git", ["branch", "-r", "--contains", "HEAD"]).split("\n").some((s) => s.trim() === "origin/main")) throw Error("Publish the source commit on origin/main first");
}
mkdirSync(output, { recursive: true });
run("bun", ["test", "grammars/tests"]);
const assets: string[] = [];
const packs: Record<string, unknown> = {};
for (const g of grammars) {
  const vendor = sourceDirectory(g);
  const upstream = JSON.parse(readFileSync(join(vendor, "UPSTREAM.json"), "utf8"));
  if (upstream.revision !== g.revision) throw Error(`Stale vendored source for ${g.name}; vendor the new pins first`);
  const descriptor = join(output, `${g.name}-descriptor.c`);
  writeFileSync(descriptor, `#include "${join(root, "grammars/PackABI.h")}"
extern const TSLanguage *${g.symbol}(void);
static const LegendGrammarPackV1 pack = {1, ${JSON.stringify(g.name)}, ${JSON.stringify(g.scope)}, ${JSON.stringify(queryFor(g.name))}, &${g.symbol}};
__attribute__((visibility("default"))) const LegendGrammarPackV1 *legend_grammar_pack_v1(void) { return &pack; }
`);
  const platforms: Record<string, unknown> = {};
  for (const cpu of arch === "all" ? ["arm64", "x86_64"] : [arch]) {
    const filename = `${g.name}-macos-${cpu}.dylib`;
    const artifact = join(output, filename);
    run("clang", ["-dynamiclib", "-std=c11", "-fno-trigraphs", "-Wno-trigraphs", "-O2", "-fvisibility=hidden", "-arch", cpu, "-mmacosx-version-min=14.0",
      `-I${join(vendor, "src")}`, join(vendor, "src/parser.c"),
      ...(existsSync(join(vendor, "src/scanner.c")) ? [join(vendor, "src/scanner.c")] : []), descriptor, "-o", artifact]);
    run("codesign", ["--force", "--sign", identity ?? "-", ...(identity ? ["--timestamp", "--options", "runtime"] : []), artifact]);
    run("codesign", ["--verify", "--strict", artifact]);
    if (publish) {
      const details = spawnSync("codesign", ["-dv", "--verbose=4", artifact], { encoding: "utf8" });
      if (details.status !== 0 || !/^TeamIdentifier=[A-Z0-9]{10}$/m.test(details.stderr))
        throw Error("Publishing requires Apple team-signed grammar libraries, not ad-hoc signatures");
    }
    const bytes = readFileSync(artifact);
    platforms[`macos-${cpu}`] = { filename, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
      url: `https://github.com/${catalog.repository}/releases/download/${tag}/${filename}` };
    assets.push(artifact);
  }
  const license = join(output, `${g.name}-LICENSE.txt`);
  writeFileSync(license, readFileSync(join(vendor, "LICENSE")));
  assets.push(license);
  packs[g.name] = { revision: g.revision, dependencies: g.dependencies, platforms,
    aliases: g.aliases, extensions: g.extensions, filenames: g.filenames, scope: g.scope };
}
const manifest = join(output, "manifest.json");
writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, packABI: 1, version, sourceCommit: capture("git", ["rev-parse", "HEAD"]), packs }, null, 2) + "\n");
console.log(`Built ${assets.length} assets: ${output}`);
// Test the *actual dylibs* before allowing the only remote mutation below.
run("bun", ["grammars/scripts/test-packs.ts", output]);
if (publish) run("gh", ["release", "create", tag, manifest, ...assets, "--repo", catalog.repository,
  "--target", capture("git", ["rev-parse", "HEAD"]), "--latest=false", "--title", `Grammars ${version}`, "--notes", "Pinned, verified native Tree-sitter grammar packs."]);
else console.log("Local build/verification only. Nothing published. --publish is required for a GitHub release.");
if (publish) console.log(`Release uploaded. After smoke testing it, set grammars/channel.json releaseVersion to ${JSON.stringify(version)} and commit/push that small catalog promotion separately.`);
