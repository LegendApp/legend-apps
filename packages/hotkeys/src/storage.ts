import { createObservableFile, type StorageRoot } from "@legend-apps/storage";

import {
  normalizeHotkeyFile,
  serializeHotkeyFilePatch,
  type HotkeyBindingLimitOptions,
  type HotkeyDefinition,
  type HotkeyFile,
} from "./index";

export function createHotkeyStore<HotkeyId extends string>({
  definitions,
  filename = "hotkeys",
  maxBindingsPerCommand,
  root = "applicationSupport",
  subfolder,
}: {
  definitions: readonly HotkeyDefinition<HotkeyId>[];
  filename?: string;
} & HotkeyBindingLimitOptions & {
  root?: StorageRoot;
  subfolder?: string;
}) {
  const bindingLimitOptions = { maxBindingsPerCommand };
  const initialValue = normalizeHotkeyFile(undefined, definitions, bindingLimitOptions);
  return createObservableFile<HotkeyFile<HotkeyId>>({
    filename,
    initialValue,
    root,
    subfolder,
    transform: {
      load: (value) => normalizeHotkeyFile(value, definitions, bindingLimitOptions),
      save: (value) => serializeHotkeyFilePatch(value, definitions, bindingLimitOptions),
    },
  });
}
