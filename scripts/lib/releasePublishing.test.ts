import assert from "node:assert/strict";
import test from "node:test";
import { partitionGitStatus } from "./releasePublishing.ts";

test("partitions release-owned changes from unrelated work", () => {
  const status = [
    " M apps/diff/package.json",
    "M  apps/diff/CHANGELOG.md",
    " M bun.lock",
    "?? updates/diff/appcast-arm.xml",
    " M apps/markdown/src/App.tsx",
    "?? artifacts/profile.json",
  ].join("\n");

  assert.deepEqual(
    partitionGitStatus(status, [
      "apps/diff/package.json",
      "apps/diff/CHANGELOG.md",
      "bun.lock",
      "updates/diff/appcast-arm.xml",
    ]),
    {
      releaseChanges: [
        " M apps/diff/package.json",
        "M  apps/diff/CHANGELOG.md",
        " M bun.lock",
        "?? updates/diff/appcast-arm.xml",
      ],
      unexpectedChanges: [
        " M apps/markdown/src/App.tsx",
        "?? artifacts/profile.json",
      ],
    },
  );
});

test("uses a renamed file's destination path", () => {
  assert.deepEqual(
    partitionGitStatus("R  updates/diff/old.xml -> updates/diff/appcast-arm.xml", [
      "updates/diff/appcast-arm.xml",
    ]),
    {
      releaseChanges: ["R  updates/diff/old.xml -> updates/diff/appcast-arm.xml"],
      unexpectedChanges: [],
    },
  );
});
