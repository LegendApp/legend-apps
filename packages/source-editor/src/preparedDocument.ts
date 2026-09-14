import NativeSourceDocuments from "./NativeSourceDocuments";

export type PreparedDocumentMetadata = {
  lineCount: number; firstId: number; complete: boolean; error: string; sourcePrefix: string;
};

/** Start bounded native I/O from an open action, before scheduling a React render.
 * Pass the token to exactly one editor. Cancel it if the open is abandoned.
 * Cancellation after the editor claims it is harmless; the editor then owns it. */
export function prepareDocument(path: string): string {
  return NativeSourceDocuments.prepare(path);
}
export function cancelPreparedDocument(token: string | undefined) {
  if (token) NativeSourceDocuments.cancel(token);
}
/** Memory-only, nonblocking peek. No I/O or native-view dependency. */
export function getPreparedDocumentMetadata(token: string | undefined, path: string): PreparedDocumentMetadata | null {
  if (!token) return null;
  const json = NativeSourceDocuments.snapshot(token, path);
  return json ? JSON.parse(json) as PreparedDocumentMetadata : null;
}
