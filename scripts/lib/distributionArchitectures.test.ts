// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import { distributionArchitectures } from "./distributionArchitectures";

test("Slides packaging only offers the architecture of its embedded compiler", () => {
  expect(distributionArchitectures("slides", "package", "arm64").map(x => x.value)).toEqual(["arm"]);
  expect(distributionArchitectures("slides", "package", "x64").map(x => x.value)).toEqual(["x86"]);
  expect(() => distributionArchitectures("slides", "package", "unknown")).toThrow("Unsupported");
});
test("publishing accepts artifacts built on both machines, other apps retain cross builds", () => {
  expect(distributionArchitectures("slides", "release", "arm64").map(x => x.value)).toEqual(["all", "arm", "x86"]);
  expect(distributionArchitectures("music", "package", "arm64").map(x => x.value)).toEqual(["all", "arm", "x86"]);
});
