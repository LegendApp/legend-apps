const fs = require("node:fs");
const path = require("node:path");

const localSparkStatusPath = "/__legend_spark_local";

function assertPublishedSpark() {
  if (process.env.LEGEND_SPARK_LOCAL) {
    throw new Error("Local Spark is enabled. Unset LEGEND_SPARK_LOCAL for CI, release, distribution, or push checks.");
  }
}

function configureLocalSpark(config, root) {
  const local = process.env.LEGEND_SPARK_LOCAL;
  if (!local) return;
  if (process.env.CI) assertPublishedSpark();

  const checkout = path.resolve(root, local);
  const packages = path.join(checkout, "packages");
  const desktop = path.join(packages, "desktop");
  const readManifest = (directory) => JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
  const sdk = fs.existsSync(path.join(desktop, "package.json")) ? readManifest(desktop) : undefined;
  if (sdk?.name !== "@legendapp/spark") {
    throw new Error(`LEGEND_SPARK_LOCAL must point to a legend-spark checkout: ${checkout}`);
  }

  const packageRoot = fs.realpathSync(packages);
  const modules = new Map();
  for (const directory of fs.readdirSync(packageRoot)) {
    const location = path.join(packageRoot, directory);
    if (!fs.existsSync(path.join(location, "package.json"))) continue;
    const { name, main } = readManifest(location);
    if (name.startsWith("@legendapp/spark-") && main) modules.set(name, { location, main });
  }

  config.watchFolders = [...new Set([...config.watchFolders, packageRoot])];
  const resolve = config.resolver.resolveRequest;
  const installedSdkManifest = path.join(root, "node_modules/@legendapp/spark/package.json");
  config.resolver.resolveRequest = (context, name, platform) => {
    if (name.startsWith("@legendapp/spark/")) {
      const entry = sdk.exports[`.${name.slice("@legendapp/spark".length)}`];
      if (typeof entry === "string" && /\.[jt]sx?$/.test(entry)) {
        return resolve(context, path.resolve(packageRoot, "desktop", entry), platform);
      }
    }
    if (context.originModulePath.startsWith(packageRoot + path.sep) && !name.startsWith(".") && !path.isAbsolute(name)) {
      if (name.startsWith("@legendapp/spark-")) {
        const [scope, moduleName, ...subpath] = name.split("/");
        const module = modules.get(`${scope}/${moduleName}`);
        if (module) return resolve(context, path.resolve(module.location, subpath.join("/") || module.main), platform);
      }
      // Resolve peers using the installed SDK's dependencies, even if Spark has its own install.
      context = { ...context, originModulePath: installedSdkManifest };
    }
    return resolve(context, name, platform);
  };

  const enhance = config.server.enhanceMiddleware;
  config.server.enhanceMiddleware = (middleware, server) => {
    const next = enhance ? enhance(middleware, server) : middleware;
    return (request, response, done) => {
      if (request.url === localSparkStatusPath) {
        response.setHeader("X-Legend-Spark-Local", encodeURIComponent(checkout));
        response.statusCode = 204;
        return response.end();
      }
      return next(request, response, done);
    };
  };
  console.log(`Using local Spark JavaScript and TypeScript from ${checkout}`);
}

module.exports = { assertPublishedSpark, configureLocalSpark, localSparkStatusPath };
