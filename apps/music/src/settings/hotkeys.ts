export type MusicGlobalHotkey = Readonly<{
  keyCode: number;
  modifiers: number;
}>;

export type MusicGlobalHotkeyPreset = MusicGlobalHotkey & Readonly<{
  id: string;
  label: string;
}>;

export const commandModifier = 1 << 20;
export const shiftModifier = 1 << 17;
export const optionModifier = 1 << 19;
export const controlModifier = 1 << 18;

export const globalHotkeyPresets: readonly MusicGlobalHotkeyPreset[] = [
  {
    id: "command-shift-l",
    keyCode: 37,
    label: "Command+Shift+L",
    modifiers: commandModifier | shiftModifier,
  },
  {
    id: "command-shift-space",
    keyCode: 49,
    label: "Command+Shift+Space",
    modifiers: commandModifier | shiftModifier,
  },
  {
    id: "command-option-l",
    keyCode: 37,
    label: "Command+Option+L",
    modifiers: commandModifier | optionModifier,
  },
  {
    id: "control-option-space",
    keyCode: 49,
    label: "Control+Option+Space",
    modifiers: controlModifier | optionModifier,
  },
];

export const defaultGlobalHotkey = globalHotkeyPresets[0];

export function normalizeGlobalHotkey(value: Partial<MusicGlobalHotkey> | undefined | null): MusicGlobalHotkey {
  if (typeof value?.keyCode === "number" && typeof value.modifiers === "number") {
    return {
      keyCode: value.keyCode,
      modifiers: value.modifiers,
    };
  }

  return {
    keyCode: defaultGlobalHotkey.keyCode,
    modifiers: defaultGlobalHotkey.modifiers,
  };
}

export function getGlobalHotkeyLabel(value: MusicGlobalHotkey) {
  const preset = globalHotkeyPresets.find((candidate) =>
    candidate.keyCode === value.keyCode && candidate.modifiers === value.modifiers
  );

  return preset?.label ?? `Key ${value.keyCode} / modifiers ${value.modifiers}`;
}

export function getNextGlobalHotkey(value: MusicGlobalHotkey) {
  const index = globalHotkeyPresets.findIndex((candidate) =>
    candidate.keyCode === value.keyCode && candidate.modifiers === value.modifiers
  );

  return globalHotkeyPresets[(index + 1) % globalHotkeyPresets.length] ?? defaultGlobalHotkey;
}
