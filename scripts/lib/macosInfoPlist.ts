import fs from "node:fs";
import path from "node:path";
import { shellDir } from "./apps";
import { macOSDefaultInfoPlistPath } from "./macosShell";
import {
  getMacOSReleaseBuild,
  getMacOSReleaseVersion,
  getMacOSSparkleFeedUrl,
  getMacOSSparklePublicEdKey,
} from "./release";
import type { AppManifest, AppPackageMetadata, MacOSDocumentType, MacOSReleaseArch } from "./types";

const baseInfoPlistPath = path.join(shellDir, "macos", macOSDefaultInfoPlistPath);

function escapePlistString(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function renderStringArray(key: string, values: string[] | undefined, indent: string) {
  const cleanValues = values?.filter(Boolean) ?? [];
  if (cleanValues.length === 0) {
    return "";
  }

  return [
    `${indent}<key>${key}</key>`,
    `${indent}<array>`,
    ...cleanValues.map((value) => `${indent}\t<string>${escapePlistString(value)}</string>`),
    `${indent}</array>`,
  ].join("\n");
}

function renderDocumentType(type: MacOSDocumentType) {
  const entries = [
    `\t\t<key>CFBundleTypeName</key>`,
    `\t\t<string>${escapePlistString(type.name)}</string>`,
    `\t\t<key>CFBundleTypeRole</key>`,
    `\t\t<string>${escapePlistString(type.role ?? "Editor")}</string>`,
    `\t\t<key>LSHandlerRank</key>`,
    `\t\t<string>${escapePlistString(type.handlerRank ?? "Owner")}</string>`,
    renderStringArray("CFBundleTypeExtensions", type.extensions, "\t\t"),
    renderStringArray("LSItemContentTypes", type.contentTypes, "\t\t"),
    type.iconFile
      ? [
          `\t\t<key>CFBundleTypeIconFile</key>`,
          `\t\t<string>${escapePlistString(type.iconFile)}</string>`,
        ].join("\n")
      : "",
  ].filter(Boolean);

  return ["\t<dict>", ...entries, "\t</dict>"].join("\n");
}

function renderDocumentTypes(types: MacOSDocumentType[]) {
  return [
    "\t<key>CFBundleDocumentTypes</key>",
    "\t<array>",
    ...types.map(renderDocumentType),
    "\t</array>",
  ].join("\n");
}

function renderUrlSchemes(schemes: string[]) {
  return [
    "\t<key>CFBundleURLTypes</key>",
    "\t<array>",
    "\t<dict>",
    "\t\t<key>CFBundleURLSchemes</key>",
    "\t\t<array>",
    ...schemes.map((scheme) => `\t\t\t<string>${escapePlistString(scheme)}</string>`),
    "\t\t</array>",
    "\t</dict>",
    "\t</array>",
  ].join("\n");
}

function renderCustomStrings(values: Record<string, string>) {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => [
      `\t<key>${escapePlistString(key)}</key>`,
      `\t<string>${escapePlistString(value)}</string>`,
    ])
    .join("\n");
}

function renderDevAppTransportSecurity() {
  return [
    "\t<key>NSAppTransportSecurity</key>",
    "\t<dict>",
    "\t\t<key>NSExceptionDomains</key>",
    "\t\t<dict>",
    "\t\t\t<key>localhost</key>",
    "\t\t\t<dict>",
    "\t\t\t\t<key>NSExceptionAllowsInsecureHTTPLoads</key>",
    "\t\t\t\t<true/>",
    "\t\t\t</dict>",
    "\t\t</dict>",
    "\t</dict>",
  ].join("\n");
}

function replacePlistString(plist: string, key: string, value: string) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  if (!pattern.test(plist)) {
    throw new Error(`Could not set ${key} in ${baseInfoPlistPath}.`);
  }

  return plist.replace(pattern, (_match, prefix: string, suffix: string) => {
    return `${prefix}${escapePlistString(value)}${suffix}`;
  });
}

function renderSparkleMetadata(manifest: AppManifest, mode: "dev" | "release", arch: MacOSReleaseArch) {
  if (mode !== "release" || !manifest.release?.macos) {
    return "";
  }

  return [
    "\t<key>SUFeedURL</key>",
    `\t<string>${escapePlistString(getMacOSSparkleFeedUrl(manifest, arch))}</string>`,
    "\t<key>SUPublicEDKey</key>",
    `\t<string>${escapePlistString(getMacOSSparklePublicEdKey(manifest))}</string>`,
  ].join("\n");
}

export function writeMacOSInfoPlist(
  manifest: AppManifest,
  appPackage: AppPackageMetadata,
  outputDir: string,
  mode: "dev" | "release",
  arch: MacOSReleaseArch,
) {
  const documentTypes = manifest.documentTypes?.macos?.filter((type) => type.name);
  const urlSchemes = manifest.urlSchemes?.macos?.filter(Boolean) ?? [];
  const customStrings = manifest.infoPlist?.macos ?? {};
  const hostWindowHidden = manifest.hostWindow?.macos?.hidden === true;
  const hostWindowStartupBackgroundColors = manifest.hostWindow?.macos?.startupBackgroundColors;
  const basePlist = replacePlistString(
    replacePlistString(
      fs.readFileSync(baseInfoPlistPath, "utf8"),
      "CFBundleShortVersionString",
      getMacOSReleaseVersion(appPackage),
    ),
    "CFBundleVersion",
    getMacOSReleaseBuild(manifest, appPackage),
  );
  const appMetadata = [
    "\t<key>LegendAppId</key>",
    `\t<string>${escapePlistString(manifest.id)}</string>`,
    "\t<key>LegendAppDisplayName</key>",
    `\t<string>${escapePlistString(manifest.displayName)}</string>`,
    "\t<key>LegendHostWindowHidden</key>",
    hostWindowHidden ? "\t<true/>" : "\t<false/>",
    ...(hostWindowStartupBackgroundColors
      ? [
          "\t<key>LegendHostWindowDarkBackgroundColor</key>",
          `\t<string>${escapePlistString(hostWindowStartupBackgroundColors.dark)}</string>`,
          "\t<key>LegendHostWindowLightBackgroundColor</key>",
          `\t<string>${escapePlistString(hostWindowStartupBackgroundColors.light)}</string>`,
        ]
      : []),
  ].join("\n");
  const sparkleMetadata = renderSparkleMetadata(manifest, mode, arch);
  const outputPlist = basePlist.replace(
    "\n</dict>\n</plist>\n",
    `\n${appMetadata}${mode === "dev" ? `\n${renderDevAppTransportSecurity()}` : ""}${sparkleMetadata ? `\n${sparkleMetadata}` : ""}${documentTypes && documentTypes.length > 0 ? `\n${renderDocumentTypes(documentTypes)}` : ""}${urlSchemes.length > 0 ? `\n${renderUrlSchemes(urlSchemes)}` : ""}${Object.keys(customStrings).length > 0 ? `\n${renderCustomStrings(customStrings)}` : ""}\n</dict>\n</plist>\n`,
  );
  const outputPath = path.join(outputDir, "Info.plist");

  if (outputPlist === basePlist) {
    throw new Error(`Could not inject document types into ${baseInfoPlistPath}.`);
  }

  fs.writeFileSync(outputPath, outputPlist);
  return outputPath;
}
