import { Buffer } from "buffer";
/** React Native hosts need not provide the browser TextDecoder global. */
export function decodeProcessText(bytes: Uint8Array): string { return Buffer.from(bytes).toString("utf8"); }
