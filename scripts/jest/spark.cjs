const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

// Spark ships TypeScript and private modules in a single SDK archive. Resolve
// public capability mocks to their implementation entry, so nested SDK imports
// observe the same mock as the app (without mocking the whole SDK).
module.exports = function withSpark(config) {
  const requireSpark = createRequire(require.resolve("@legendapp/spark/package.json"));
  const packageFile = requireSpark.resolve("./package.json");
  const root = path.dirname(packageFile);
  const manifest = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  function resolveEntry(specifier) {
    try { return requireSpark.resolve(specifier); } catch (error) {
      if (!specifier.startsWith(".")) throw error;
      let candidate = path.resolve(root, specifier);
      const packageFile = path.join(candidate, "package.json");
      if (fs.existsSync(packageFile)) candidate = path.join(candidate, JSON.parse(fs.readFileSync(packageFile, "utf8")).main);
      for (const suffix of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        if (fs.existsSync(candidate + suffix) && fs.statSync(candidate + suffix).isFile()) return candidate + suffix;
      }
      throw error;
    }
  }
  const mapper = { ...config.moduleNameMapper };
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    if (typeof entry !== "string" || !entry.endsWith(".ts")) continue;
    const source = fs.readFileSync(path.join(root, entry), "utf8");
    const match = /^export (?:\*|(?:type )?\{[^}]*\}) from "([^"]+)";/.exec(source);
    if (!match) continue;
    const target = resolveEntry(match[1]);
    const publicName = "@legendapp/spark" + subpath.slice(1);
    const key = "^" + escape(publicName) + "$";
    const existingKey = Object.keys(mapper).find(candidate => new RegExp(candidate).test(publicName));
    mapper[key] = existingKey ? mapper[existingKey] : target;
    const internal = /(?:vendor\/node_modules\/)?(@legendapp\/spark-[^/]+)(.*)/.exec(match[1]);
    if (internal && existingKey) {
      const suffix = internal[2].replace(/\/index\.[^/]+$/, "");
      mapper["^" + escape(internal[1] + suffix) + "$"] = mapper[existingKey];
    }
  }
  mapper["^@legendapp/(spark-[^/]+)/(.*)$"] = path.join(root, "vendor/node_modules/@legendapp/$1/$2");
  return {
    ...config,
    moduleNameMapper: mapper,
    transformIgnorePatterns: (config.transformIgnorePatterns ?? ["node_modules/"]).map(pattern =>
      pattern.replace("node_modules/", "node_modules/(?!.*(?:@legendapp/spark|@legendapp\\+spark@))")),
  };
};
