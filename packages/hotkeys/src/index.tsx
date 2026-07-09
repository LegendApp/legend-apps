import {
  addKeyDownListener,
  addKeyUpListener,
  createModifierMask,
  hasModifier,
  KeyCodes,
  type KeyboardEvent,
} from "@legend-apps/keyboard-manager";
import { cn } from "@legend-apps/classnames";
import type { NativeMenuShortcut } from "@legend-apps/native-menu";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export type HotkeyValue =
  | number
  | `${number}`
  | `${number}+${number}`
  | `${number}+${number}+${number}`
  | `${number}+${number}+${number}+${number}`;

export type HotkeyDefinition<HotkeyId extends string = string> = {
  defaultValue: HotkeyValue | null;
  description?: string;
  id: HotkeyId;
  repeat?: boolean;
  title: string;
};

export type HotkeyState<HotkeyId extends string = string> = Record<HotkeyId, HotkeyValue | null>;

export type HotkeyHandlers<HotkeyId extends string = string> = Partial<Record<HotkeyId, () => boolean | void>>;

const modifierCodes = [
  KeyCodes.MODIFIER_COMMAND,
  KeyCodes.MODIFIER_SHIFT,
  KeyCodes.MODIFIER_OPTION,
  KeyCodes.MODIFIER_CONTROL,
  KeyCodes.MODIFIER_CAPS_LOCK,
  KeyCodes.MODIFIER_FUNCTION,
] as const;

const menuModifierCodes = [
  KeyCodes.MODIFIER_COMMAND,
  KeyCodes.MODIFIER_SHIFT,
  KeyCodes.MODIFIER_OPTION,
  KeyCodes.MODIFIER_CONTROL,
  KeyCodes.MODIFIER_CAPS_LOCK,
  KeyCodes.MODIFIER_FUNCTION,
] as const;

const modifierSet = new Set<number>(modifierCodes);
const menuModifierSet = new Set<number>(menuModifierCodes);
const implicitFunctionModifierKeyCodes = new Set<number>([
  KeyCodes.KEY_UP,
  KeyCodes.KEY_DOWN,
  KeyCodes.KEY_LEFT,
  KeyCodes.KEY_RIGHT,
  KeyCodes.KEY_HOME,
  KeyCodes.KEY_END,
  KeyCodes.KEY_PAGE_UP,
  KeyCodes.KEY_PAGE_DOWN,
]);

export const KeyText: Record<number, string> = (() => {
  const keyText: Record<number, string> = {};

  for (const [key, value] of Object.entries(KeyCodes)) {
    if (typeof value === "number" && !key.startsWith("MODIFIER_")) {
      const name = key.startsWith("KEY_") ? key.substring(4) : key;
      keyText[value] = name.length === 1 ? name : name.charAt(0) + name.slice(1).toLowerCase();
    }
  }

  return {
    ...keyText,
    [KeyCodes.KEY_RETURN]: "↩",
    [KeyCodes.KEY_TAB]: "⇥",
    [KeyCodes.KEY_SPACE]: "Space",
    [KeyCodes.KEY_DELETE]: "⌫",
    [KeyCodes.KEY_FORWARD_DELETE]: "⌦",
    [KeyCodes.KEY_ESCAPE]: "Esc",
    [KeyCodes.KEY_LEFT]: "←",
    [KeyCodes.KEY_RIGHT]: "→",
    [KeyCodes.KEY_DOWN]: "↓",
    [KeyCodes.KEY_UP]: "↑",
    [KeyCodes.KEY_MINUS]: "-",
    [KeyCodes.KEY_EQUALS]: "=",
    [KeyCodes.KEY_COMMA]: ",",
    [KeyCodes.KEY_PERIOD]: ".",
    [KeyCodes.KEY_SLASH]: "/",
    [KeyCodes.KEY_MEDIA_PLAY_PAUSE]: "Play/Pause",
    [KeyCodes.KEY_MEDIA_NEXT]: "Next Track",
    [KeyCodes.KEY_MEDIA_PREVIOUS]: "Previous Track",
    [KeyCodes.MODIFIER_COMMAND]: "⌘",
    [KeyCodes.MODIFIER_SHIFT]: "⇧",
    [KeyCodes.MODIFIER_OPTION]: "⌥",
    [KeyCodes.MODIFIER_CONTROL]: "⌃",
    [KeyCodes.MODIFIER_CAPS_LOCK]: "⇪",
    [KeyCodes.MODIFIER_FUNCTION]: "Fn",
  };
})();

const textToKeyCode = Object.entries(KeyText).reduce<Record<string, number>>((acc, [keyCode, text]) => {
  acc[text] = Number(keyCode);
  return acc;
}, {});

const functionKeyEquivalents: Record<number, number> = {
  [KeyCodes.KEY_UP]: 0xf700,
  [KeyCodes.KEY_DOWN]: 0xf701,
  [KeyCodes.KEY_LEFT]: 0xf702,
  [KeyCodes.KEY_RIGHT]: 0xf703,
};

function isModifierKeyCode(keyCode: number) {
  return modifierSet.has(keyCode);
}

function uniqueKeyCodes(keyCodes: readonly number[]) {
  return keyCodes.filter((keyCode, index) => keyCodes.indexOf(keyCode) === index);
}

function orderedKeyCodes(keyCodes: readonly number[]) {
  return uniqueKeyCodes([
    ...modifierCodes.filter((modifier) => keyCodes.includes(modifier)),
    ...keyCodes.filter((keyCode) => !isModifierKeyCode(keyCode)),
  ]);
}

export function parseHotkey(value: HotkeyValue | null | undefined): number[] {
  if (value === null || value === undefined) {
    return [];
  }

  return `${value}`
    .split("+")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      if (textToKeyCode[segment] !== undefined) {
        return textToKeyCode[segment];
      }

      const numeric = Number(segment);
      return Number.isNaN(numeric) ? undefined : numeric;
    })
    .filter((keyCode): keyCode is number => typeof keyCode === "number");
}

export function serializeHotkey(keyCodes: readonly number[]): HotkeyValue | null {
  const ordered = orderedKeyCodes(keyCodes);
  const hasNonModifier = ordered.some((keyCode) => !isModifierKeyCode(keyCode));
  return hasNonModifier ? ordered.map((keyCode) => `${keyCode}`).join("+") as HotkeyValue : null;
}

export function formatHotkey(value: HotkeyValue | null | undefined, placeholder = "") {
  const keyCodes = parseHotkey(value);
  return keyCodes.length > 0
    ? orderedKeyCodes(keyCodes).map((keyCode) => KeyText[keyCode] ?? `${keyCode}`).join(" + ")
    : placeholder;
}

export function createDefaultHotkeyState<HotkeyId extends string>(
  definitions: readonly HotkeyDefinition<HotkeyId>[],
): HotkeyState<HotkeyId> {
  return Object.fromEntries(definitions.map((definition) => [definition.id, definition.defaultValue])) as HotkeyState<HotkeyId>;
}

function eventModifierCodes(event: KeyboardEvent, configuredModifiers: readonly number[] = []) {
  return modifierCodes.filter((modifier) => {
    const ignoreImplicitFunctionModifier =
      modifier === KeyCodes.MODIFIER_FUNCTION &&
      implicitFunctionModifierKeyCodes.has(event.keyCode) &&
      !configuredModifiers.includes(KeyCodes.MODIFIER_FUNCTION);

    return !ignoreImplicitFunctionModifier && hasModifier(event, modifier);
  });
}

export function matchesHotkey(event: KeyboardEvent, value: HotkeyValue | null | undefined) {
  const keyCodes = parseHotkey(value);
  if (keyCodes.length === 0) {
    return false;
  }

  const configuredModifiers = keyCodes.filter(isModifierKeyCode);
  const configuredKeyCode = keyCodes.find((keyCode) => !isModifierKeyCode(keyCode));
  const activeModifiers = eventModifierCodes(event, configuredModifiers);
  const modifierMask = createModifierMask(...configuredModifiers);
  const activeMask = createModifierMask(...activeModifiers);

  return configuredKeyCode !== undefined && event.keyCode === configuredKeyCode && activeMask === modifierMask;
}

function keyCodeToMenuKeyEquivalent(keyCode: number): string | null {
  if (functionKeyEquivalents[keyCode] !== undefined) {
    return String.fromCharCode(functionKeyEquivalents[keyCode]);
  }

  switch (keyCode) {
    case KeyCodes.KEY_RETURN:
      return "\r";
    case KeyCodes.KEY_TAB:
      return "\t";
    case KeyCodes.KEY_SPACE:
      return " ";
    case KeyCodes.KEY_ESCAPE:
      return "\u001b";
    case KeyCodes.KEY_DELETE:
    case KeyCodes.KEY_BACKSPACE:
      return "\u0008";
    case KeyCodes.KEY_FORWARD_DELETE:
      return String.fromCharCode(0x007f);
    default: {
      const text = KeyText[keyCode];
      return text && text.length === 1 ? text.toLowerCase() : null;
    }
  }
}

export function hotkeyToMenuShortcut(hotkey: HotkeyValue | null | undefined): NativeMenuShortcut | null {
  const keyCodes = parseHotkey(hotkey);
  let modifiers = 0;
  let keyCode: number | null = null;

  for (const code of keyCodes) {
    if (menuModifierSet.has(code)) {
      modifiers |= code;
    } else if (keyCode === null) {
      keyCode = code;
    }
  }

  const keyEquivalent = keyCode === null ? null : keyCodeToMenuKeyEquivalent(keyCode);
  return keyEquivalent ? { key: keyEquivalent, modifiers } : null;
}

export function useHotkeys<HotkeyId extends string>({
  definitions,
  enabled = true,
  handlers,
  values,
}: {
  definitions: readonly HotkeyDefinition<HotkeyId>[];
  enabled?: boolean;
  handlers: HotkeyHandlers<HotkeyId>;
  values: HotkeyState<HotkeyId>;
}) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    return addKeyDownListener((event) => {
      for (const definition of definitions) {
        const handler = handlers[definition.id];
        const value = values[definition.id] ?? definition.defaultValue;
        if (handler && matchesHotkey(event, value)) {
          return handler() !== false;
        }
      }
      return false;
    });
  }, [definitions, enabled, handlers, values]);
}

type HotkeyCaptureProps = {
  className?: string;
  disabled?: boolean;
  onCaptureChange?: (isCapturing: boolean) => void;
  onChange: (value: HotkeyValue | null) => void;
  placeholder?: string;
  value: HotkeyValue | null;
};

type HotkeyCaptureId = symbol;

let activeHotkeyCaptureId: HotkeyCaptureId | null = null;
const activeHotkeyCaptureListeners = new Set<() => void>();
const activeHotkeyCaptureCancelHandlers = new Map<HotkeyCaptureId, () => void>();

function getActiveHotkeyCaptureId() {
  return activeHotkeyCaptureId;
}

function subscribeActiveHotkeyCapture(listener: () => void) {
  activeHotkeyCaptureListeners.add(listener);
  return () => {
    activeHotkeyCaptureListeners.delete(listener);
  };
}

function registerHotkeyCaptureCancelHandler(id: HotkeyCaptureId, cancelHandler: () => void) {
  activeHotkeyCaptureCancelHandlers.set(id, cancelHandler);
  return () => {
    activeHotkeyCaptureCancelHandlers.delete(id);
  };
}

function emitActiveHotkeyCaptureChange() {
  for (const listener of activeHotkeyCaptureListeners) {
    listener();
  }
}

function setActiveHotkeyCaptureId(nextId: HotkeyCaptureId | null) {
  if (activeHotkeyCaptureId !== nextId) {
    const previousId = activeHotkeyCaptureId;
    activeHotkeyCaptureId = nextId;
    if (previousId && previousId !== nextId) {
      activeHotkeyCaptureCancelHandlers.get(previousId)?.();
    }
    emitActiveHotkeyCaptureChange();
  }
}

function clearActiveHotkeyCaptureId(id: HotkeyCaptureId) {
  if (activeHotkeyCaptureId === id) {
    activeHotkeyCaptureId = null;
    emitActiveHotkeyCaptureChange();
  }
}

function pressedCodesFromSet(pressedCodes: Set<number>) {
  return [...pressedCodes].filter((keyCode) => Number.isFinite(keyCode));
}

export function HotkeyCapture({
  className,
  disabled = false,
  onCaptureChange,
  onChange,
  placeholder = "Click to record",
  value,
}: HotkeyCaptureProps) {
  const [captureId] = useState<HotkeyCaptureId>(() => Symbol("HotkeyCapture"));
  const activeCaptureId = useSyncExternalStore(
    subscribeActiveHotkeyCapture,
    getActiveHotkeyCaptureId,
    getActiveHotkeyCaptureId,
  );
  const isCapturing = activeCaptureId === captureId;
  const [pressedDisplay, setPressedDisplay] = useState<string | null>(null);
  const lastValidCapture = useRef<number[] | null>(null);
  const lastStartTimeRef = useRef(0);
  const wasCapturingRef = useRef(false);
  const pressedCodesRef = useRef(new Set<number>());

  const notifyCaptureChange = useCallback((nextCapturing: boolean) => {
    if (wasCapturingRef.current !== nextCapturing) {
      wasCapturingRef.current = nextCapturing;
      onCaptureChange?.(nextCapturing);
    }
  }, [onCaptureChange]);

  const resetCaptureState = useCallback(() => {
    pressedCodesRef.current.clear();
    lastValidCapture.current = null;
    setPressedDisplay(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (getActiveHotkeyCaptureId() === captureId) {
      setActiveHotkeyCaptureId(null);
    } else {
      resetCaptureState();
      notifyCaptureChange(false);
    }
  }, [captureId, notifyCaptureChange, resetCaptureState]);

  const handleCommit = useCallback(() => {
    const nextValue = lastValidCapture.current ? serializeHotkey(lastValidCapture.current) : null;
    if (nextValue) {
      onChange(nextValue);
    }
    handleCancel();
  }, [handleCancel, onChange]);

  const handleStart = useCallback(() => {
    if (!disabled) {
      lastStartTimeRef.current = Date.now();
      resetCaptureState();
      setActiveHotkeyCaptureId(captureId);
      notifyCaptureChange(true);
    }
  }, [captureId, disabled, notifyCaptureChange, resetCaptureState]);

  const handlePress = useCallback(() => {
    if (getActiveHotkeyCaptureId() !== captureId) {
      handleStart();
    }
  }, [captureId, handleStart]);

  useEffect(() => {
    if (wasCapturingRef.current !== isCapturing) {
      if (!isCapturing) {
        resetCaptureState();
      }
      notifyCaptureChange(isCapturing);
    }
  }, [isCapturing, notifyCaptureChange, resetCaptureState]);

  useEffect(() => {
    return registerHotkeyCaptureCancelHandler(captureId, () => {
      resetCaptureState();
      notifyCaptureChange(false);
    });
  }, [notifyCaptureChange, resetCaptureState]);

  useEffect(() => {
    const updateCapture = () => {
      const pressedCodes = pressedCodesFromSet(pressedCodesRef.current);
      if (pressedCodes.includes(KeyCodes.KEY_ESCAPE)) {
        handleCancel();
      } else if (pressedCodes.length > 0) {
        setPressedDisplay(formatHotkey(serializeHotkey(pressedCodes)));
        if (pressedCodes.some((keyCode) => !isModifierKeyCode(keyCode))) {
          lastValidCapture.current = pressedCodes;
        }
      } else if (lastValidCapture.current) {
        handleCommit();
      } else {
        handleCancel();
      }
    };

    const removeDown = addKeyDownListener((event) => {
      if (getActiveHotkeyCaptureId() !== captureId) {
        return false;
      }
      pressedCodesRef.current.add(event.keyCode);
      for (const modifier of modifierCodes) {
        if (hasModifier(event, modifier)) {
          pressedCodesRef.current.add(modifier);
        } else {
          pressedCodesRef.current.delete(modifier);
        }
      }
      updateCapture();
      return true;
    });
    const removeUp = addKeyUpListener((event) => {
      if (getActiveHotkeyCaptureId() !== captureId) {
        return false;
      }
      pressedCodesRef.current.delete(event.keyCode);
      for (const modifier of modifierCodes) {
        if (!hasModifier(event, modifier)) {
          pressedCodesRef.current.delete(modifier);
        }
      }
      updateCapture();
      return true;
    });

    return () => {
      removeDown();
      removeUp();
    };
  }, [handleCancel, handleCommit]);

  useEffect(() => {
    return () => {
      clearActiveHotkeyCaptureId(captureId);
    };
  }, []);

  useEffect(() => {
    if (disabled && isCapturing) {
      handleCancel();
    }
  }, [disabled, handleCancel, isCapturing]);

  const displayValue = useMemo(() => {
    if (isCapturing) {
      return pressedDisplay || "Press keys...";
    }
    return formatHotkey(value, placeholder);
  }, [isCapturing, placeholder, pressedDisplay, value]);

  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "min-h-8 min-w-44 justify-center rounded-md border border-border-primary bg-background-primary px-3 py-1.5",
        isCapturing && "border-accent-primary",
        disabled && "opacity-60",
        className,
      )}
      disabled={disabled}
      focusable
      onBlur={() => {
        if (isCapturing && Date.now() - lastStartTimeRef.current > 100) {
          handleCancel();
        }
      }}
      onPressIn={handleStart}
      onPress={handlePress}
    >
      <View className="flex-row items-center">
        <Text className={cn("text-sm text-text-primary", !value && !isCapturing && "text-text-tertiary")}>
          {displayValue}
        </Text>
      </View>
    </Pressable>
  );
}

type HotkeysSettingsPageProps<HotkeyId extends string> = {
  definitions: readonly HotkeyDefinition<HotkeyId>[];
  onCaptureChange?: (isCapturing: boolean) => void;
  onChange: (id: HotkeyId, value: HotkeyValue | null) => void;
  renderFooter?: () => ReactNode;
  showTitle?: boolean;
  values: HotkeyState<HotkeyId>;
};

export function HotkeysSettingsContent<HotkeyId extends string>({
  definitions,
  onCaptureChange,
  onChange,
  renderFooter,
  showTitle = true,
  values,
}: HotkeysSettingsPageProps<HotkeyId>) {
  return (
    <>
      <View className="flex-col gap-6">
        {showTitle ? (
          <View className="flex-col gap-1.5">
            <Text className="text-xl font-semibold text-text-primary leading-tight">Hotkeys</Text>
          </View>
        ) : null}
        <View className="overflow-hidden rounded-xl border border-border-primary bg-background-secondary/20">
          {definitions.map((definition, index) => (
            <View key={definition.id}>
              {index > 0 ? <View className="bg-border-primary" style={styles.rowSeparator} /> : null}
              <View
                className="flex-row items-center justify-between gap-6 px-4 py-3.5"
              >
                <View className="min-w-0 flex-1 flex-col gap-1 pr-6" style={styles.rowText}>
                  <Text className="font-semibold text-text-primary leading-tight" style={styles.rowTitle}>
                    {definition.title}
                  </Text>
                  {definition.description ? (
                    <Text className="leading-relaxed text-text-secondary" style={styles.rowDescription}>
                      {definition.description}
                    </Text>
                  ) : null}
                </View>
                <View className="max-w-full flex-shrink" style={styles.rowControl}>
                  <HotkeyCapture
                    onCaptureChange={onCaptureChange}
                    onChange={(value) => onChange(definition.id, value)}
                    value={values[definition.id] ?? definition.defaultValue}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
      {renderFooter?.()}
    </>
  );
}

export function HotkeysSettingsPage<HotkeyId extends string>(props: HotkeysSettingsPageProps<HotkeyId>) {
  return (
    <View className="flex-1 overflow-hidden" style={styles.page}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex flex-col"
        contentContainerStyle={styles.pageContent}
        horizontal={false}
      >
        <HotkeysSettingsContent {...props} />
      </ScrollView>
    </View>
  );
}

export { KeyCodes };

const styles = StyleSheet.create({
  page: {
    flex: 1,
    overflow: "hidden",
  },
  pageContent: {
    alignSelf: "center",
    flexDirection: "column",
    maxWidth: 896,
    paddingHorizontal: 24,
    paddingTop: 56,
    width: "100%",
  },
  rowControl: {
    flexShrink: 1,
    maxWidth: "100%",
  },
  rowText: {
    minWidth: 0,
  },
  rowDescription: {
    fontSize: 12,
  },
  rowTitle: {
    fontSize: 13,
  },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.75,
  },
});
