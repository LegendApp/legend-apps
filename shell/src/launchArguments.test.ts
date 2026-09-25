import assert from "node:assert/strict";
import { test } from "node:test";
import { appLaunchArguments } from "./launchArguments";

test("Metro options cannot become a document path", () => {
  assert.deepEqual(appLaunchArguments(["/App.app/Contents/MacOS/App", "-RCT_jsLocation", "127.0.0.1:19094", "/tmp/example.ts"]), ["/App.app/Contents/MacOS/App", "/tmp/example.ts"]);
});

test("ordinary arguments and absent arguments retain their identity", () => {
  const args = ["/tmp/example.ts", "--custom", "value"];
  assert.equal(appLaunchArguments(args), args);
  assert.equal(appLaunchArguments(undefined), undefined);
  assert.deepEqual(appLaunchArguments(["-RCT_jsLocation"]), []);
});
