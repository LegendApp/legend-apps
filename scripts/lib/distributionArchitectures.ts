export function assertDistributionArchitecture(appId: string, action: "package" | "release", arch: string, host: string) {
  if (appId !== "slides") return;
  if (arch !== "arm") throw new Error("Slides distribution supports Apple Silicon only.");
  if (action === "package" && host !== "arm64") throw new Error("Package Slides on Apple Silicon to match its embedded compiler.");
}

export function distributionArchitectures(appId: string, action: "package" | "release", host: string) {
  if (appId === "slides") {
    assertDistributionArchitecture(appId, action, "arm", host);
    return [{ value: "arm", label: "Apple Silicon" }];
  }
  return [{ value: "all", label: "Apple Silicon and Intel" }, { value: "arm", label: "Apple Silicon" }, { value: "x86", label: "Intel" }];
}
