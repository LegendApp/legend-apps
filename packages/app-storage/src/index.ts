import NativeAppStorage from "./NativeAppStorage";

export async function getStoredString(key: string) {
  const value = await NativeAppStorage.getString(key);
  return value || null;
}

export function setStoredString(key: string, value: string) {
  return NativeAppStorage.setString(key, value);
}

export function removeStoredItem(key: string) {
  return NativeAppStorage.removeItem(key);
}

export { NativeAppStorage };
