import { type HotkeyName, getHotkey, getHotkeyMetadata } from '../../settings/Hotkeys';
import { state$ } from '../State';
import KeyboardManager, {
  type KeyboardEvent,
  KeyCodes,
  KeyText,
} from './KeyboardManager';
import { ax } from '../../utils/ax';
import { batch, event, observable } from '@legendapp/state';
import { useMount, useObserveEffect } from '@legendapp/state/react';

type KeyboardEventCode = number;
type KeyboardEventCodeModifier = string;

export type KeyboardEventCodeHotkey =
  | KeyboardEventCode
  | `${KeyboardEventCode}`
  | `${KeyboardEventCodeModifier}+${KeyboardEventCode}`
  | `${KeyboardEventCodeModifier}+${KeyboardEventCodeModifier}+${KeyboardEventCode}`;

export const keysPressed$ = observable<Record<string, boolean>>({});
const keyRepeat$ = event();

const keysToPreventDefault = new Set<KeyboardEventCode>();

// Updated KeyInfo to only require the action function
export interface KeyInfo {
  action: () => void;
}

// Global registry for hotkeys with their name and action description
export interface HotkeyInfo {
  name: string;
  key: KeyboardEventCodeHotkey;
  description: string;
  repeat?: boolean;
  keyText?: string;
}
export const hotkeyRegistry$ = observable<Record<string, HotkeyInfo>>({});

const MODIFIERS = [
  KeyCodes.MODIFIER_COMMAND,
  KeyCodes.MODIFIER_SHIFT,
  KeyCodes.MODIFIER_OPTION,
  KeyCodes.MODIFIER_CONTROL,
] as const;

// Handle events to set current key states
const onKeyDown = (e: KeyboardEvent) => {
  const { keyCode, modifiers } = e;

  batch(() => {
    // Add the pressed key
    const isAlreadyPressed = keysPressed$[keyCode].get();
    keysPressed$[keyCode].set(true);

    // Handle modifiers
    for (const mod of MODIFIERS) {
      keysPressed$[mod].set(!!(modifiers & mod));
    }

    if (isAlreadyPressed) {
      keyRepeat$.fire();
    }
  });

  return (
    state$.listeningForKeyPress.get() ||
    (!state$.showSettings.get() && keysToPreventDefault.has(keyCode))
  );
};

const onKeyUp = (e: KeyboardEvent) => {
  const { keyCode, modifiers } = e;

  batch(() => {
    // Remove the released key
    keysPressed$[keyCode].delete();

    // Handle modifiers
    for (const mod of MODIFIERS) {
      keysPressed$[mod].set(!!(modifiers & mod));
    }
  });

  return (
    state$.listeningForKeyPress.get() ||
    (!state$.showSettings.get() && keysToPreventDefault.has(keyCode))
  );
};

export function useHookKeyboard() {
  useMount(() => {
    // Set up listeners
    let cleanupFns: (() => void)[];
    try {
      cleanupFns = [
        KeyboardManager.addKeyDownListener(onKeyDown),
        KeyboardManager.addKeyUpListener(onKeyUp),
      ];
    } catch (error) {
      console.error('Failed to set up keyboard listeners:', error);
    }

    // Return cleanup function
    return () => {
      try {
        for (const cleanup of cleanupFns) {
          cleanup();
        }
      } catch (error) {
        console.error('Failed to clean up keyboard listeners:', error);
      }
    };
  });
}

// Updated HotkeyCallbacks to map hotkey names to simple action functions
type HotkeyCallbacks = Partial<Record<HotkeyName, () => void>>;

export function onHotkeys(hotkeyCallbacks: HotkeyCallbacks) {
  const hotkeyMap = new Map<string[], () => void>();
  const repeatActions = new Set<string[]>();

  // Process each combination and its callback
  for (const [name, action] of Object.entries(hotkeyCallbacks)) {
    if (action) {
      // Get the configured key for this hotkey from hotkeys$
      const configuredKey = getHotkey(name as any);
      if (!configuredKey) {
        console.warn(`No hotkey configuration found for ${name}`);
        continue;
      }

      const keys =
        typeof configuredKey === 'number'
          ? [configuredKey.toString()]
          : configuredKey.toLowerCase().split('+');

      keysToPreventDefault.add(Number(keys[keys.length - 1]));
      hotkeyMap.set(keys, action);

      // Get metadata for this hotkey
      const metadata = getHotkeyMetadata(name as any);

      if (metadata?.repeat) {
        repeatActions.add(keys);
      }

      // Register the hotkey with its name and action description
      if (metadata) {
        // Get keyText from KeyText mapping for numeric keys
        const keyText = typeof configuredKey === 'number' ? KeyText[configuredKey] : configuredKey;

        hotkeyRegistry$[name].set({
          name,
          key: configuredKey,
          description: metadata.description,
          repeat: metadata.repeat,
          keyText,
        });
      }
    }
  }

  const checkHotkeys = () => {
    if (state$.showSettings.get()) {
      // Disable hotkeys when settings is open
      return;
    }
    for (const [keys, callback] of hotkeyMap) {
      // If every key in the hotkey is pressed, call the callback
      const allKeysPressed = keys.every((key) => keysPressed$[key].get());
      if (allKeysPressed) {
        callback();
      }
    }
  };

  const checkRepeatHotkeys = () => {
    if (state$.showSettings.get()) {
      // Disable hotkeys when settings is open
      return;
    }
    for (const keys of repeatActions) {
      const callback = hotkeyMap.get(keys);
      if (callback) {
        // If every key in the hotkey is pressed, call the callback
        const allKeysPressed = keys.every((key) => keysPressed$[key].get());
        if (allKeysPressed) {
          callback();
        }
      }
    }
  };

  const unsubs = ax(
    keysPressed$.onChange(checkHotkeys),
    repeatActions.size > 0 ? keyRepeat$.on(checkRepeatHotkeys) : undefined
  );

  return () => {
    for (const unsub of unsubs) {
      unsub();
    }
  };
}

export function useOnHotkeys(hotkeyCallbacks: HotkeyCallbacks) {
  useObserveEffect((e) => {
    const sub = onHotkeys(hotkeyCallbacks);
    e.onCleanup = sub;
  });
}
