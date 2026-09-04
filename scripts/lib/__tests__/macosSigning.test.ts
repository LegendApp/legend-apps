// @ts-nocheck Bun tests run separately from the workspace typecheck.
import { expect, test } from "bun:test";
import { getMacOSDevelopmentSigningArgs } from "../run";

test("uses a certificate-backed identity when a macOS development team is configured", () => {
  expect(getMacOSDevelopmentSigningArgs("LOCAL_TEAM_ID")).toEqual([
    "DEVELOPMENT_TEAM=LOCAL_TEAM_ID",
    "CODE_SIGN_STYLE=Automatic",
    "CODE_SIGN_IDENTITY=Apple Development",
    "-allowProvisioningUpdates",
  ]);
});

test("preserves default signing when no local team is configured", () => {
  expect(getMacOSDevelopmentSigningArgs()).toEqual([]);
});
