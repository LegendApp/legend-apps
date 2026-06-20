import { createDefaultHotkeyState, KeyCodes, type HotkeyDefinition } from "@legend-desktop/hotkeys";

export const markdownHotkeyDefinitions = [
  {
    defaultValue: `${KeyCodes.MODIFIER_COMMAND}+${KeyCodes.MODIFIER_OPTION}+${KeyCodes.KEY_T}`,
    description: "Show or hide the formatting toolbar.",
    id: "toggleFormattingToolbar",
    title: "Toggle Formatting Toolbar",
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
  {
    defaultValue: `${KeyCodes.MODIFIER_SHIFT}+${KeyCodes.KEY_UP}`,
    description: "Extend the block selection upward when the text selection is at the start of a block.",
    id: "extendBlockSelectionUp",
    title: "Extend Block Selection Up",
  },
  {
    defaultValue: `${KeyCodes.MODIFIER_SHIFT}+${KeyCodes.KEY_DOWN}`,
    description: "Extend the block selection downward when the text selection is at the end of a block.",
    id: "extendBlockSelectionDown",
    title: "Extend Block Selection Down",
  },
  {
    defaultValue: `${KeyCodes.MODIFIER_COMMAND}+${KeyCodes.KEY_UP}`,
    description: "Focus the first markdown block.",
    id: "focusFirstBlock",
    title: "Focus First Block",
  },
  {
    defaultValue: `${KeyCodes.MODIFIER_COMMAND}+${KeyCodes.KEY_DOWN}`,
    description: "Focus the last markdown block.",
    id: "focusLastBlock",
    title: "Focus Last Block",
  },
] as const satisfies readonly HotkeyDefinition<string>[];

export type MarkdownHotkeyId = (typeof markdownHotkeyDefinitions)[number]["id"];

export const defaultMarkdownHotkeySettings = createDefaultHotkeyState(markdownHotkeyDefinitions);
