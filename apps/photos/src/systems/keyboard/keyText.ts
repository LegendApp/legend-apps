// Keep labels stable: they are stored in existing hotkeys.json files.
export function createKeyText(KeyCodes: Record<string, number>): Record<number, string> {
  const keyText: Record<number, string> = {};

  // Create entries for all KeyCodes
  for (const [key, value] of Object.entries(KeyCodes)) {
    if (typeof value === 'number' && !key.startsWith('MODIFIER_')) {
      // Extract the name part after KEY_ prefix
      const name = key.startsWith('KEY_') ? key.substring(4) : key;

      // Format the key name (convert to title case for special keys, keep uppercase for single letters)
      if (name.length === 1) {
        keyText[value] = name;
      } else {
        // Convert to title case (first letter uppercase, rest lowercase)
        keyText[value] = name.charAt(0) + name.slice(1).toLowerCase();
      }
    }
  }

  // Special case overrides
  const overrides: Record<number, string> = {
    // Spark does not currently name the macOS F13 virtual key.
    105: "F13",
    [KeyCodes.KEY_RETURN]: '↩',
    [KeyCodes.KEY_TAB]: '⇥',
    [KeyCodes.KEY_SPACE]: 'Space',
    [KeyCodes.KEY_DELETE]: '⌫',
    [KeyCodes.KEY_ESCAPE]: 'Esc',
    [KeyCodes.KEY_LEFT]: '←',
    [KeyCodes.KEY_RIGHT]: '→',
    [KeyCodes.KEY_DOWN]: '↓',
    [KeyCodes.KEY_UP]: '↑',
    [KeyCodes.KEY_MINUS]: '-',
    [KeyCodes.KEY_EQUALS]: '=',
    [KeyCodes.KEY_COMMA]: ',',
    [KeyCodes.KEY_PERIOD]: '.',
    [KeyCodes.KEY_SLASH]: '/',
    [KeyCodes.MODIFIER_COMMAND]: '⌘',
    [KeyCodes.MODIFIER_SHIFT]: '⇧',
    [KeyCodes.MODIFIER_OPTION]: '⌥',
    [KeyCodes.MODIFIER_CONTROL]: '⌃',
    [KeyCodes.MODIFIER_CAPS_LOCK]: '⇪',
  };

  // Apply overrides
  return { ...keyText, ...overrides };
}
