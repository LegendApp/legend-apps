import NativeStorage from "./NativeStorage";

export function readApplicationSupportJson<T>(relativePath: string): T | undefined {
  const value = NativeStorage.readStorageText("applicationSupport", relativePath);
  if (value === null) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export function writeApplicationSupportJson(relativePath: string, value: unknown) {
  return NativeStorage.writeStorageText("applicationSupport", relativePath, JSON.stringify(value));
}
