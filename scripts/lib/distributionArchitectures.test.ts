import { expect, test } from "bun:test";
import { assertDistributionArchitecture, distributionArchitectures } from "./distributionArchitectures";

test("Slides packaging and publishing offer only Apple Silicon", () => {
  expect(distributionArchitectures("slides", "package", "arm64").map(x => x.value)).toEqual(["arm"]);
  expect(distributionArchitectures("slides", "release", "arm64").map(x => x.value)).toEqual(["arm"]);
  expect(distributionArchitectures("slides", "release", "x64").map(x => x.value)).toEqual(["arm"]);
  expect(() => distributionArchitectures("slides", "package", "x64")).toThrow("Apple Silicon");
});

test("direct distribution commands reject unsupported Slides architectures", () => {
  for (const action of ["package", "release"] as const) {
    for (const arch of ["x86", "all"]) expect(() => assertDistributionArchitecture("slides", action, arch, "arm64")).toThrow("Apple Silicon");
  }
  expect(() => assertDistributionArchitecture("slides", "package", "arm", "x64")).toThrow("embedded compiler");
  expect(() => assertDistributionArchitecture("slides", "release", "arm", "x64")).not.toThrow();
});

test("other apps retain cross builds", () => {
  expect(distributionArchitectures("music", "package", "arm64").map(x => x.value)).toEqual(["all", "arm", "x86"]);
  expect(() => assertDistributionArchitecture("diff", "package", "all", "x64")).not.toThrow();
});
