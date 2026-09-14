import { observable } from "@legendapp/state";
import { cancelPreparedDocument, prepareDocument } from "@legend-apps/source-editor/preload";

export type CodeViewerFileRequest = {
  path: string | null;
  version: number;
  preparedDocumentId?: string;
};

export const codeViewerFileRequest$ = observable<CodeViewerFileRequest>({
  path: null,
  version: 0,
});

export function requestCodeViewerFile(path: string) {
  const preparedDocumentId = prepareDocument(path);
  cancelPreparedDocument(codeViewerFileRequest$.preparedDocumentId.peek());
  codeViewerFileRequest$.set({
    path,
    preparedDocumentId,
    version: codeViewerFileRequest$.version.peek() + 1,
  });
}

export function consumeCodeViewerFileRequest(version: number) {
  const request = codeViewerFileRequest$.peek();
  if (!request.path || request.version !== version) return undefined;
  // The viewer now owns this token, including cancellation during confirmation.
  // Do not replay a consumed single-use token when another window mounts.
  codeViewerFileRequest$.set({ path: null, version });
  return request;
}
