import { loadHotkeys } from "./hotkeySerialization";
import type { HotkeyValue } from "@legendapp/spark/shortcuts/commands";
import { createJSONManager } from '../utils/JSONManager';
import { syncState } from '@legendapp/state';
import { observable } from '@legendapp/state';

// Default hotkey settings
const DEFAULT_HOTKEYS = {
  // Photo navigation
  Left: 'Left',
  Right: 'Right',
  Up: 'Up',
  Down: 'Down',

  // Column adjustments
  'Decrease Columns': '-',
  'Increase Columns': '=',

  // Photo actions
  'Open Photo': 'Enter',
  'Close Photo': 'Escape',
  'Close Photo-2': 'Enter',
  'Toggle Filmstrip': 'F',

  // UI controls
  Sidebar: 'S',
  Settings: ',',
  Help: '/',
} as const;

export type HotkeyName = keyof typeof DEFAULT_HOTKEYS;

export const HotkeyMetadata: Record<HotkeyName, { description: string; repeat?: boolean }> = {
  Settings: { description: "Open Settings" },
  // Photo navigation
  Left: {
    description: 'Select previous photo',
    repeat: true,
  },
  Right: {
    description: 'Select next photo',
    repeat: true,
  },
  Up: {
    description: 'Select photo above',
    repeat: true,
  },
  Down: {
    description: 'Select photo below',
    repeat: true,
  },

  // Column adjustments
  'Decrease Columns': {
    description: 'Decrease number of columns',
    repeat: true,
  },
  'Increase Columns': {
    description: 'Increase number of columns',
    repeat: true,
  },

  // Photo actions
  'Open Photo': {
    description: 'Open selected photo in fullscreen',
  },
  'Close Photo': {
    description: 'Close fullscreen photo view',
  },
  'Close Photo-2': {
    description: 'Close fullscreen photo view',
  },
  'Toggle Filmstrip': {
    description: 'Show the filmstrip in fullscreen',
  },

  // UI controls
  Sidebar: {
    description: 'Toggle sidebar visibility',
  },
  Help: {
    description: 'Toggle shortcut help',
  },
};

// Create the hotkeys manager
export const hotkeys$ = createJSONManager<Record<HotkeyName, HotkeyValue>>({
  filename: 'hotkeys.json',
  initialValue: DEFAULT_HOTKEYS,
  saveDefaultToFile: true,
  transform: { load: value => loadHotkeys(value, DEFAULT_HOTKEYS) },
});

export const isHotkeysLoaded$ = observable(() => !!syncState(hotkeys$).isPersistLoaded.get());

export function getHotkey(name: HotkeyName): HotkeyValue {
  return hotkeys$[name].get();
}

// Export metadata for use in UI
export function getHotkeyMetadata(name: HotkeyName) {
  return HotkeyMetadata[name];
}
