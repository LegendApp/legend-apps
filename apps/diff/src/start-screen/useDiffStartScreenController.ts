import type { Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { useCallback, useState } from "react";
import { diffAppMetadata$, type RecentDiffSource } from "../diffAppMetadata";
import { normalizeDiffOpenSource, type DiffOpenSource } from "../diffFiles";
import { createOpenError, getErrorMessage } from "../viewer/diffViewerSupport";
import type { DiffLoadSourceOptions, DiffRecoverableError } from "../viewer/diffViewerModel";
import type { DiffRecentFilter } from "./diffStartScreenModel";

type LoadDiffSource = (nextSource: DiffOpenSource, options?: DiffLoadSourceOptions) => Promise<void>;

export type DiffStartScreenController = {
  dismissOpenError: () => void;
  onChangeUrlInput: (text: string) => void;
  onOpenRecentSource: (source: DiffOpenSource) => void;
  onOpenUrl: () => Promise<void>;
  openError: DiffRecoverableError | null;
  recentFilter: DiffRecentFilter;
  recentSources: RecentDiffSource[];
  retryOpenError: () => void;
  setRecentFilter: (filter: DiffRecentFilter) => void;
  urlInput: string;
  urlInputError: string | null;
};

export function useDiffStartScreenController({
  loadSource,
  loadingSource$,
  openError$,
  setDocumentErrorValue,
  setOpenErrorValue,
  setUrlInputErrorValue,
  setUrlInputValue,
  urlInput$,
  urlInputError$,
}: {
  loadSource: LoadDiffSource;
  loadingSource$: Observable<DiffOpenSource | null>;
  openError$: Observable<DiffRecoverableError | null>;
  setDocumentErrorValue: (nextError: DiffRecoverableError | null) => void;
  setOpenErrorValue: (nextError: DiffRecoverableError | null) => void;
  setUrlInputErrorValue: (nextError: string | null) => void;
  setUrlInputValue: (nextValue: string) => void;
  urlInput$: Observable<string>;
  urlInputError$: Observable<string | null>;
}): DiffStartScreenController {
  const [recentFilter, setRecentFilter] = useState<DiffRecentFilter>("all");
  const openError = useValue(openError$);
  const recentSources = useValue(diffAppMetadata$.recentSources) ?? [];
  const urlInput = useValue(urlInput$);
  const urlInputError = useValue(urlInputError$);

  const onChangeUrlInput = useCallback((text: string) => {
    setUrlInputValue(text);
    if (urlInputError$.peek()) {
      setUrlInputErrorValue(null);
    }
    if (openError$.peek()) {
      setOpenErrorValue(null);
    }
  }, [openError$, setOpenErrorValue, setUrlInputErrorValue, setUrlInputValue, urlInputError$]);

  const onOpenUrl = useCallback(async () => {
    if (!loadingSource$.peek()) {
      const nextSource = normalizeDiffOpenSource(urlInput$.peek());
      if (nextSource) {
        setOpenErrorValue(null);
        setUrlInputErrorValue(null);
        await loadSource(nextSource);
      } else {
        setUrlInputErrorValue("Paste a folder path, GitHub URL, .diff file, or two file paths.");
      }
    }
  }, [loadSource, loadingSource$, setOpenErrorValue, setUrlInputErrorValue, urlInput$]);

  const onOpenRecentSource = useCallback((nextSource: DiffOpenSource) => {
    if (!loadingSource$.peek()) {
      setDocumentErrorValue(null);
      setOpenErrorValue(null);
      setUrlInputErrorValue(null);
      loadSource(nextSource).catch((error: unknown) => {
        setOpenErrorValue(createOpenError(nextSource, getErrorMessage(error)));
      });
    }
  }, [loadSource, loadingSource$, setDocumentErrorValue, setOpenErrorValue, setUrlInputErrorValue]);

  const retryOpenError = useCallback(() => {
    const currentOpenError = openError$.peek();
    if (!loadingSource$.peek() && currentOpenError?.source) {
      setOpenErrorValue(null);
      loadSource(currentOpenError.source);
    }
  }, [loadSource, loadingSource$, openError$, setOpenErrorValue]);

  const dismissOpenError = useCallback(() => {
    setOpenErrorValue(null);
  }, [setOpenErrorValue]);

  return {
    dismissOpenError,
    onChangeUrlInput,
    onOpenRecentSource,
    onOpenUrl,
    openError,
    recentFilter,
    recentSources,
    retryOpenError,
    setRecentFilter,
    urlInput,
    urlInputError,
  };
}
