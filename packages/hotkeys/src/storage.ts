import { createObservableFile, type StorageRoot } from "@legend-apps/storage";

import {
  normalizeHotkeyFile,
  serializeHotkeyFile,
  type HotkeyDefinition,
  type HotkeyFile,
} from "./index";

export function createHotkeyStore<HotkeyId extends string>({
  definitions,
  filename = "hotkeys",
  root = "applicationSupport",
  subfolder,
}: {
  definitions: readonly HotkeyDefinition<HotkeyId>[];
  filename?: string;
  root?: StorageRoot;
  subfolder?: string;
}) {
  const initialValue = normalizeHotkeyFile(undefined, definitions);
  return createObservableFile<HotkeyFile<HotkeyId>>({
    filename,
    initialValue,
    root,
    subfolder,
    transform: {
      load: (value) => normalizeHotkeyFile(value, definitions),
      save: (value) => serializeHotkeyFile(value, definitions),
    },
  });
}
