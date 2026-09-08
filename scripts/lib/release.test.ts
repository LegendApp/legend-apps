import assert from "node:assert/strict";
import test from "node:test";
import { getMacOSReleaseBuild, getMacOSReleaseVersion } from "./release";

test("derives increasing builds from package versions above legacy builds", () => {
  const versions = ["0.0.1", "0.0.2", "0.1.0", "1.0.0"];
  const builds = versions.map((version) => getMacOSReleaseBuild({ version }));
  assert.deepEqual(builds, ["1000.0.1", "1000.0.2", "1000.1.0", "1001.0.0"]);
  const ordered = ["1", "2", ...builds];
  for (let index = 1; index < ordered.length; index++) {
    assert.ok(ordered[index].localeCompare(ordered[index - 1], undefined, { numeric: true }) > 0);
  }
  assert.equal(getMacOSReleaseVersion({ version: "0.0.2" }), "0.0.2");
});

test("normalizes supported package version forms consistently", () => {
  assert.equal(getMacOSReleaseBuild({ version: "1" }), "1001.0.0");
  assert.equal(getMacOSReleaseBuild({ version: "1.2" }), "1001.2.0");
  assert.equal(getMacOSReleaseBuild({ version: "1.2.3-beta.1+abc" }), "1001.2.3");
  assert.throws(() => getMacOSReleaseBuild({ version: "invalid" }));
});
