const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "legend-babel-")));
fs.mkdirSync(path.join(root, "shell"));
fs.copyFileSync(path.join(__dirname, "../babel.config.js"), path.join(root, "shell/babel.config.cjs"));
const configure = require(path.join(root, "shell/babel.config.cjs"));
const previousApp = process.env.LEGEND_APP;
const cacheKeys = [];
const api = { cache: { using(fn) { cacheKeys.push(fn); } } };
function appConfig(id, source) {
  const folder = path.join(root, "apps", id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "babel.config.cjs"), source);
  process.env.LEGEND_APP = id;
  return configure(api);
}

test("app extensions preserve shared plugins and resolve dependencies from the app", (t) => {
  t.after(() => {
    if (previousApp === undefined) delete process.env.LEGEND_APP;
    else process.env.LEGEND_APP = previousApp;
    fs.rmSync(root, { recursive: true, force: true });
  });
  process.env.LEGEND_APP = "chat-history";
  assert.equal(configure(api).plugins.length, 3);
  const initialKey = cacheKeys[0]();
  process.env.LEGEND_APP = "hello-world";
  assert.notEqual(cacheKeys[0](), initialKey);
  assert.equal(configure(api).plugins.length, 3);

  const folder = path.join(root, "apps/slides");
  fs.mkdirSync(path.join(folder, "node_modules/react-native-worklets"), { recursive: true });
  fs.writeFileSync(path.join(folder, "node_modules/react-native-worklets/plugin.js"), "module.exports = function () { return { visitor: {} }; };");
  const slides = appConfig("slides", fs.readFileSync(path.join(__dirname, "../../apps/slides/babel.config.cjs"), "utf8"));
  assert.equal(slides.plugins.length, 5);
  assert.equal(slides.plugins.at(-1), path.join(folder, "node_modules/react-native-worklets/plugin.js"));
  assert.equal(slides.plugins[3]({ types: {} }).name, "inline-slides-compiler-path");

  const custom = appConfig("custom", 'module.exports = { plugins: ["custom-plugin"] };');
  assert.equal(custom.plugins.at(-1), "custom-plugin");
  assert.deepEqual(custom.presets, ["babel-preset-expo"]);
  assert.throws(() => appConfig("invalid", 'module.exports = { presets: [] };'), /only a plugins array/);
  assert.throws(() => appConfig("missing-dependency", 'module.exports = { plugins: [require.resolve("uninstalled-app-plugin")] };'), /Cannot find module/);
  process.env.LEGEND_APP = "chat-history";
  assert.equal(configure(api).plugins.length, 3);
});
