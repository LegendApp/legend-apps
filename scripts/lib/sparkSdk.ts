import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./apps";

export const sparkSdkRoot = fs.realpathSync(path.join(rootDir, "node_modules/@legendapp/spark"));
const metadata = JSON.parse(fs.readFileSync(path.join(sparkSdkRoot, "package.json"), "utf8"));
export const sparkSdkPackages = (metadata.spark.bundledModules as string[]).map(name => {
  const root = path.join(sparkSdkRoot, metadata.spark.bundledModuleRoot, "node_modules", name);
  const json = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const native = !!(json.codegenConfig || json.spark?.nativeModules ||
    fs.readdirSync(root).some(file => file.endsWith(".podspec")) || fs.existsSync(path.join(root, "expo-module.config.json")));
  return { name, root, native };
});
