import { observable } from "@legendapp/state";

export type CodeViewerFileRequest = {
  path: string | null;
  version: number;
};

export const codeViewerFileRequest$ = observable<CodeViewerFileRequest>({
  path: null,
  version: 0,
});

export function requestCodeViewerFile(path: string) {
  codeViewerFileRequest$.set({
    path,
    version: codeViewerFileRequest$.version.peek() + 1,
  });
}
