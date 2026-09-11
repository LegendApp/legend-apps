import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { catalog, root, validateCatalog } from "./catalog";

// Deliberately separate upstream discovery from publication. Review this diff,
// vendor the pinned sources, and pass all pack tests before releasing.
validateCatalog();
const revisions = new Map<string, string>();
for (const g of catalog.grammars) {
  let revision = revisions.get(g.repository);
  if (!revision) {
    revision = execFileSync("git", ["ls-remote", `https://github.com/${g.repository}.git`, "HEAD"], { encoding: "utf8" }).split(/\s/)[0];
    if (!/^[a-f0-9]{40}$/.test(revision)) throw Error(`Cannot resolve ${g.repository}`);
    revisions.set(g.repository, revision);
  }
  console.log(`${g.name}: ${g.revision} -> ${revision}`);
  g.revision = revision;
}
if (process.argv.includes("--write")) writeFileSync(join(root, "grammars/catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
else console.log("Preview only. Pass --write to update pins; this never publishes a release.");
