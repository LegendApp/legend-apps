import fs from "node:fs";
import path from "node:path";
import { shellDir } from "./apps";
import { macOSDefaultInfoPlistPath } from "./macosShell";
import type { AppManifest, AppPackageMetadata, MacOSDocumentType } from "./types";

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

function getMacOSReleaseVersion(version: string) {
  const releaseVersion = version.split(/[+-]/)[0];
  if (/^\d+(?:\.\d+){0,2}$/.test(releaseVersion)) {
    return releaseVersion;
  }

  throw new Error(`App version "${version}" must start with one to three dot-separated numeric segments.`);
}

function replacePlistString(plist: string, key: string, value: string) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`);
  const nextPlist = plist.replace(pattern, `$1${escapePlistString(value)}$2`);
  if (nextPlist === plist) {
    throw new Error(`Could not set ${key} in ${baseInfoPlistPath}.`);
  }
  return nextPlist;
}

export function writeMacOSInfoPlist(manifest: AppManifest, appPackage: AppPackageMetadata, outputDir: string) {
  const documentTypes = manifest.documentTypes?.macos?.filter((type) => type.name);
  const urlSchemes = manifest.urlSchemes?.macos?.filter(Boolean) ?? [];
  const hostWindowHidden = manifest.hostWindow?.macos?.hidden === true;
  const basePlist = replacePlistString(
    replacePlistString(
      fs.readFileSync(baseInfoPlistPath, "utf8"),
      "CFBundleShortVersionString",
      getMacOSReleaseVersion(appPackage.version),
    ),
    "CFBundleVersion",
    getMacOSReleaseVersion(appPackage.version),
  );
  const appMetadata = [
    "\t<key>LegendAppId</key>",
    `\t<string>${escapePlistString(manifest.id)}</string>`,
    "\t<key>LegendAppDisplayName</key>",
    `\t<string>${escapePlistString(manifest.displayName)}</string>`,
    "\t<key>LegendHostWindowHidden</key>",
    hostWindowHidden ? "\t<true/>" : "\t<false/>",
  ].join("\n");
  const outputPlist = basePlist.replace(
    "\n</dict>\n</plist>\n",
    `\n${appMetadata}${documentTypes && documentTypes.length > 0 ? `\n${renderDocumentTypes(documentTypes)}` : ""}${urlSchemes.length > 0 ? `\n${renderUrlSchemes(urlSchemes)}` : ""}\n</dict>\n</plist>\n`,
  );
  const outputPath = path.join(outputDir, "Info.plist");

  if (outputPlist === basePlist) {
    throw new Error(`Could not inject document types into ${baseInfoPlistPath}.`);
  }

  fs.writeFileSync(outputPath, outputPlist);
  return outputPath;
}
