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

`MarkdownDocument` owns document loading, block caching, active block editing, save/autosave state, undo/redo history, and list rendering. App shells own menus, toolbars, recent files, window behavior, and other chrome.

Editing and save behavior are driven through the adapter and command ref so app shells can wire native menus, formatting toolbars, and document lifecycle prompts without reaching into internal document state.
