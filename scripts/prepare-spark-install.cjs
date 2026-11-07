const path = require("node:path");
const sdk = path.dirname(require.resolve("@legendapp/spark/package.json"));
require(path.join(sdk, "vendor/node_modules/@legendapp/spark-desktop-config/native-patches.cjs")).prepareNativePatches(path.resolve(__dirname, ".."));
