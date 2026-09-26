import { afterEach, expect, test } from "bun:test";
import { configurePhotosLaunch, getPhotosStorageSubfolder, getPhotosFixtureLibrary, getPhotosStorageRoot } from "../src/systems/launch";
afterEach(() => configurePhotosLaunch([]));
test("normal launches retain legacy settings and ignore fixture-only arguments", () => {
  configurePhotosLaunch(["--photos-test-library=/tmp/fixture"]);
  expect(getPhotosStorageSubfolder()).toBe(".legendphotos");
  expect(getPhotosStorageRoot()).toBe("document");
  expect(getPhotosFixtureLibrary()).toBeUndefined();
});
test("test sessions isolate storage and reject traversal", () => {
  expect(() => configurePhotosLaunch(["--photos-test-session=../personal"])).toThrow();
  configurePhotosLaunch(["--photos-test-session=fixture", "--photos-test-library=/tmp/photos"]);
  expect(getPhotosStorageSubfolder()).toBe(".legendphotos-tests/fixture");
  expect(getPhotosStorageRoot()).toBe("applicationSupport");
  expect(getPhotosFixtureLibrary()).toBe("/tmp/photos");
});
