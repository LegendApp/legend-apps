export const macOSProjectName = "legendapp-shell-macos";
export const macOSSchemeName = macOSProjectName;
export const macOSAppTargetName = macOSProjectName;
export const macOSAppTemplateDir = macOSProjectName;
export const macOSXcodeProjectName = `${macOSProjectName}.xcodeproj`;
export const macOSWorkspaceName = `${macOSProjectName}.xcworkspace`;
export const macOSSchemeFileName = `${macOSSchemeName}.xcscheme`;
export const macOSDefaultInfoPlistPath = `${macOSAppTemplateDir}/Info.plist`;

export function getMacOSAppWrapperName(displayName: string) {
  return `${displayName}.app`;
}
