import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { signSlidesCompiler } from "./slidesCompiler";

const machOMagic = ["cffaedfe", "cefaedfe", "cafebabe", "bebafeca", "cafebabf", "bfbafeca"];

function isMachO(file: string) {
  const fd = fs.openSync(file, "r");
  try {
    const header = Buffer.alloc(4);
    return fs.readSync(fd, header, 0, 4, 0) === 4 && machOMagic.includes(header.toString("hex"));
  } finally { fs.closeSync(fd); }
}

function codesign(identity: string, file: string, entitlements?: string) {
  const args = ["--force", "--sign", identity, ...(identity === "-" ? ["--options", "0"] : ["--options", "runtime", "--timestamp"]),
    ...(entitlements ? ["--entitlements", entitlements] : []), file];
  const result = spawnSync("codesign", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Signing ${file} failed: ${result.stderr}`);
}

/** Deepest code first, so each container seals already-signed nested code; Helpers keep their own entitlements. */
function macOSSigningOrder(app: string) {
  const helpers = path.join(app, "Contents/Helpers");
  const code: string[] = [];
  const bundles: string[] = [];
  function visit(file: string) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || file === helpers) return;
    if (stat.isDirectory()) {
      if (file !== app && /\.(app|xpc|appex|framework|bundle)$/.test(file)) bundles.push(file);
      for (const name of fs.readdirSync(file).sort()) visit(path.join(file, name));
    } else if (stat.isFile() && isMachO(file)) code.push(file);
  }
  visit(app);
  const containers = bundles.filter(bundle => code.some(file => file.startsWith(bundle + path.sep)));
  return [...code, ...containers].sort((a, b) => b.split(path.sep).length - a.split(path.sep).length || a.localeCompare(b));
}

/** Sign an app without --deep, which would apply the app's entitlements to every nested binary. */
export function signMacOSAppInsideOut(app: string, identity: string, entitlements?: string) {
  const helpers = path.join(app, "Contents/Helpers");
  for (const name of fs.existsSync(helpers) ? fs.readdirSync(helpers).sort() : []) {
    const helper = path.join(helpers, name);
    if (fs.lstatSync(helper).isDirectory()) signSlidesCompiler(helper, identity);
    else if (isMachO(helper)) codesign(identity, helper);
  }
  for (const file of macOSSigningOrder(app)) codesign(identity, file);
  codesign(identity, app, entitlements);
}
