export function loadHotkeys(
  value: Record<string, string | number>,
  keyCodeFromText: (text: string) => string,
) {
  return Object.fromEntries(Object.entries(value).map(([key, val]) => {
    // Defaults can be native codes: numeric 3 means F; the string "3" is a key label.
    return [key, typeof val === "number" ? val : val.split("+").map(keyCodeFromText).join("+")];
  }));
}
