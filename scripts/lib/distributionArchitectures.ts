/** Slides embeds the running Bun binary, so it can only package that architecture. */
export function distributionArchitectures(appId: string, action: "package" | "release", host: string) {
  if (appId === "slides" && action === "package") {
    if (host !== "arm64" && host !== "x64") throw new Error(`Unsupported Slides compiler architecture: ${host}`);
    return [{ value: host === "arm64" ? "arm" : "x86", label: host === "arm64" ? "Apple Silicon (this Mac)" : "Intel (this Mac)" }];
  }
  return [{ value: "all", label: "Apple Silicon and Intel" }, { value: "arm", label: "Apple Silicon" }, { value: "x86", label: "Intel" }];
}
