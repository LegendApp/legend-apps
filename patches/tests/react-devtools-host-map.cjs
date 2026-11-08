// Run with node --expose-gc and the installed react-devtools-core/dist/backend.js path.
const { readFileSync } = require("node:fs");
const assert = require("node:assert/strict");

if (!process.argv[2] || !global.gc) throw new Error("Provide backend.js and run node --expose-gc");
const source = readFileSync(process.argv[2], "utf8");
const maps = source.slice(source.indexOf("var publicInstanceToDevToolsInstanceMap ="), source.indexOf("function getNativeTag(instance) {"));
const lifecycle = source.slice(source.indexOf("function aquireHostInstance(nearestInstance, hostInstance) {"), source.indexOf("function aquireHostResource(nearestInstance, resource) {"));
const api = new Function("renderer_typeof", maps + lifecycle + `
  const mapFor = typeof getPublicInstanceMap === "function" ? getPublicInstanceMap : () => publicInstanceToDevToolsInstanceMap;
  return {
    acquire: aquireHostInstance,
    release: releaseHostInstance,
    get: key => mapFor(key).get(key),
    has: key => mapFor(key).has(key),
  };
`)(value => typeof value);

function check(host, key) {
  const owner = {};
  api.acquire(owner, host);
  assert.equal(api.get(key), owner);
  assert.equal(api.has(key), true);
  api.release({}, host);
  assert.equal(api.get(key), owner);
  api.release(owner, host);
  assert.equal(api.has(key), false);
}
check({ _nativeTag: 42 }, 42);
const web = { nodeType: 1 };
check(web, web);
const publicInstance = {};
check({ node: {}, canonical: { publicInstance } }, publicInstance);
const fabric = { node: {}, canonical: { publicInstance: null } };
check(fabric, fabric);

function retire() {
  const payload = {}, host = { node: {}, canonical: { publicInstance: null } };
  const owner = { host, payload };
  api.acquire(owner, host);
  return { host: new WeakRef(host), owner: new WeakRef(owner), payload: new WeakRef(payload) };
}
(async () => {
  const retired = retire();
  for (let i = 0; i < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 0));
    global.gc();
  }
  assert.equal(retired.host.deref(), undefined);
  assert.equal(retired.owner.deref(), undefined);
  assert.equal(retired.payload.deref(), undefined);
  console.log("Host lookup, owner-safe cleanup, numeric tags and unreachable cycles pass");
})().catch(error => { console.error(error); process.exitCode = 1; });
