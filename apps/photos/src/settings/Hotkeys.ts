import { loadHotkeys } from "../systems/keyboard/hotkeySerialization";
import type { KeyboardEventCodeHotkey } from '../systems/keyboard/Keyboard';
import { KeyCodes, KeyText, keyCodeFromText } from '../systems/keyboard/KeyboardManager';
import { createJSONManager } from '../utils/JSONManager';
import { syncState } from '@legendapp/state';
import { observable } from '@legendapp/state';

// Default hotkey settings
const DEFAULT_HOTKEYS = {
  // Photo navigation
  Left: KeyCodes.KEY_LEFT,
  Right: KeyCodes.KEY_RIGHT,
  Up: KeyCodes.KEY_UP,
  Down: KeyCodes.KEY_DOWN,

  // Column adjustments
  'Decrease Columns': KeyCodes.KEY_MINUS,
  'Increase Columns': KeyCodes.KEY_EQUALS,

  // Photo actions
  'Open Photo': KeyCodes.KEY_RETURN,
  'Close Photo': KeyCodes.KEY_ESCAPE,
  'Close Photo-2': KeyCodes.KEY_RETURN,
  'Toggle Filmstrip': KeyCodes.KEY_F,

  // UI controls
  Sidebar: KeyCodes.KEY_S,
  Settings: KeyCodes.KEY_COMMA,
  Help: KeyCodes.KEY_SLASH,
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
export const hotkeys$ = createJSONManager<Record<HotkeyName, KeyboardEventCodeHotkey>>({
  filename: 'hotkeys.json',
  initialValue: DEFAULT_HOTKEYS,
  saveDefaultToFile: true,
  transform: {
    load: (value: Record<string, string | number>) => loadHotkeys(value, keyCodeFromText),
    save: (value: Record<string, string>) => {
      return Object.fromEntries(
        Object.entries(value).map(([key, val]) => {
          const vals = `${val}`.split('+');
          // Add the main key text
          const parts = vals.map((v) => {
            if (KeyText[+v]) {
              return KeyText[+v];
            }
            return +v;
          });

          // Join with + or return empty string if no parts
          return [key, parts.join('+')];
        })
      );
    },
  },
});

export const isHotkeysLoaded$ = observable(() => !!syncState(hotkeys$).isPersistLoaded.get());

export function getHotkey(name: HotkeyName): KeyboardEventCodeHotkey {
  return hotkeys$[name].get();
}

// Export metadata for use in UI
export function getHotkeyMetadata(name: HotkeyName) {
  return HotkeyMetadata[name];
}
