import type { DiffFileSummary } from "@legend-desktop/diff-parser";

export function getDirectoryPath(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(0, separatorIndex) : "";
}

export function getFileStatusPresentation(file: Pick<DiffFileSummary, "isBinary" | "status"> | null | undefined) {
  const status = file?.status ?? "unknown";
  let presentation = {
    backgroundColor: "#f0883e",
    color: "#1f1300",
    symbolName: "pencil",
    title: "Modified",
  };

  switch (status) {
    case "added":
      presentation = {
        backgroundColor: "#238636",
        color: "#ffffff",
        symbolName: "plus",
        title: "Added",
      };
      break;
    case "untracked":
      presentation = {
        backgroundColor: "#238636",
        color: "#ffffff",
        symbolName: "plus",
        title: "Untracked",
      };
      break;
    case "deleted":
      presentation = {
        backgroundColor: "#da3633",
        color: "#ffffff",
        symbolName: "minus",
        title: "Deleted",
      };
      break;
    case "renamed":
      presentation = {
        backgroundColor: "#388bfd",
        color: "#ffffff",
        symbolName: "arrow.right",
        title: "Renamed",
      };
      break;
    case "copied":
      presentation = {
        backgroundColor: "#8957e5",
        color: "#ffffff",
        symbolName: "doc.on.doc",
        title: "Copied",
      };
      break;
    case "modified":
      break;
    default:
      presentation = {
        backgroundColor: "#6e7681",
        color: "#ffffff",
        symbolName: "questionmark",
        title: status === "unknown" ? "Unknown" : status,
      };
      break;
  }

  return file?.isBinary
    ? { ...presentation, title: `${presentation.title} binary` }
    : presentation;
}

export function getFilePathContext(file: DiffFileSummary, directory: string) {
  const hasOldPath = file.oldPath && file.oldPath !== file.path;
  let context = directory ? `${directory}/` : "";
  if (hasOldPath && (file.status === "renamed" || file.status === "copied")) {
    context = `${file.oldPath} -> ${context}`;
  }
  return context;
}

export function fileMatchesFilter(file: DiffFileSummary, normalizedFilter: string) {
  let matches = true;
  if (normalizedFilter) {
    const haystack = `${file.path} ${file.oldPath} ${file.status}`.toLowerCase();
    const terms = normalizedFilter.split(/\s+/).filter(Boolean);
    matches = terms.every((term) => haystack.includes(term));
  }
  return matches;
}

export function getActiveDiffFile(files: readonly DiffFileSummary[], activeFileIndex: number | null) {
  let activeFile = activeFileIndex === null
    ? null
    : files.find((file) => file.index === activeFileIndex) ?? null;
  if (!activeFile) {
    activeFile = files[0] ?? null;
  }
  return activeFile;
}

export function getJoinedPath(basePath: string, relativePath: string) {
  return `${basePath.replace(/\/+$/, "")}/${relativePath.replace(/^\/+/, "")}`;
}
