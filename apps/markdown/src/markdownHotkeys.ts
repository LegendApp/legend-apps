import { getDefaultHotkeyBindings, createHotkeyRouter, type HotkeyDefinition } from "@legendapp/spark/shortcuts/commands";

export const markdownHotkeyDefinitions = [
  {
    defaultBindings: ["Cmd+Alt+T"],
    description: "Show or hide the formatting toolbar.",
    id: "toggleFormattingToolbar",
    title: "Toggle Formatting Toolbar",
  },
  {
    defaultBindings: ["Alt+Up"],
    description: "Move the active block or selected blocks one position up.",
    id: "moveBlockUp",
    title: "Move Block Up",
  },
  {
    defaultBindings: ["Alt+Down"],
    description: "Move the active block or selected blocks one position down.",
    id: "moveBlockDown",
    title: "Move Block Down",
  },
  {
    defaultBindings: ["Shift+Up"],
    description: "Extend the block selection upward when the text selection is at the start of a block.",
    id: "extendBlockSelectionUp",
    title: "Extend Block Selection Up",
  },
  {
    defaultBindings: ["Shift+Down"],
    description: "Extend the block selection downward when the text selection is at the end of a block.",
    id: "extendBlockSelectionDown",
    title: "Extend Block Selection Down",
  },
  {
    defaultBindings: ["Cmd+Up"],
    description: "Focus the first markdown block.",
    id: "focusFirstBlock",
    title: "Focus First Block",
  },
  {
    defaultBindings: ["Cmd+Down"],
    description: "Focus the last markdown block.",
    id: "focusLastBlock",
    title: "Focus Last Block",
  },
] as const satisfies readonly HotkeyDefinition<string>[];

export type MarkdownHotkeyId = (typeof markdownHotkeyDefinitions)[number]["id"];

export const defaultMarkdownHotkeySettings = Object.fromEntries(markdownHotkeyDefinitions.map(definition => [definition.id, getDefaultHotkeyBindings(definition)])) as Record<MarkdownHotkeyId, readonly string[]>;

export const markdownHotkeyRouter = createHotkeyRouter();
