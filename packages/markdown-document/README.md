# @legend-desktop/markdown-document

Reusable markdown document surface for Legend Desktop apps.

```tsx
import {
  MarkdownDocument,
  nativeMarkdownDocumentAdapter,
} from "@legend-desktop/markdown-document";

export function DocumentScreen({ filename }: { filename: string }) {
  return (
    <MarkdownDocument
      adapter={nativeMarkdownDocumentAdapter}
      filename={filename}
      onError={(error) => {
        console.error(error);
      }}
    />
  );
}
```

`MarkdownDocument` owns document loading, block caching, and list rendering. App shells own menus, toolbars, recent files, window behavior, and other chrome.

The initial implementation is read-only. Editing, autosave, undo/redo, and richer commands are added through the adapter and command ref without changing the app-shell boundary.
