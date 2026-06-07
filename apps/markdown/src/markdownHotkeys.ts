import { createDefaultHotkeyState, KeyCodes, type HotkeyDefinition } from "@legend-desktop/hotkeys";

export const markdownHotkeyDefinitions = [
  {
    defaultValue: KeyCodes.KEY_UP,
    description: "Focus the previous markdown block.",
    id: "focusPreviousBlock",
    title: "Focus Previous Block",
  },
  {
    defaultValue: KeyCodes.KEY_DOWN,
    description: "Focus the next markdown block.",
    id: "focusNextBlock",
    title: "Focus Next Block",
  },
  {
    defaultValue: `${KeyCodes.MODIFIER_OPTION}+${KeyCodes.KEY_UP}`,
    description: "Move the active block or selected blocks one position up.",
    id: "moveBlockUp",
    title: "Move Block Up",
  },
  {
    defaultValue: `${KeyCodes.MODIFIER_OPTION}+${KeyCodes.KEY_DOWN}`,
    description: "Move the active block or selected blocks one position down.",
    id: "moveBlockDown",
    title: "Move Block Down",
  },
] as const satisfies readonly HotkeyDefinition<string>[];

export type MarkdownHotkeyId = (typeof markdownHotkeyDefinitions)[number]["id"];

export const defaultMarkdownHotkeySettings = createDefaultHotkeyState(markdownHotkeyDefinitions);
