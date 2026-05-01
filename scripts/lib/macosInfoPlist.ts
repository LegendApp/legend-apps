import fs from "node:fs";
import path from "node:path";
import { shellDir } from "./apps";
import type { AppManifest, MacOSDocumentType } from "./types";

const baseInfoPlistPath = path.join(shellDir, "macos", "legendapp-shell-macos", "Info.plist");

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

export function writeMacOSInfoPlist(manifest: AppManifest, outputDir: string) {
  const documentTypes = manifest.documentTypes?.macos?.filter((type) => type.name);
  if (!documentTypes || documentTypes.length === 0) {
    return undefined;
  }

  const basePlist = fs.readFileSync(baseInfoPlistPath, "utf8");
  const outputPlist = basePlist.replace(
    "\n</dict>\n</plist>\n",
    `\n${renderDocumentTypes(documentTypes)}\n</dict>\n</plist>\n`,
  );
  const outputPath = path.join(outputDir, "Info.plist");

  if (outputPlist === basePlist) {
    throw new Error(`Could not inject document types into ${baseInfoPlistPath}.`);
  }

  fs.writeFileSync(outputPath, outputPlist);
  return outputPath;
}
