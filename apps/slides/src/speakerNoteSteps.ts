export type SpeakerNoteSection = { markdown: string; step?: number };

/** Human-facing step numbers are one-based; the runtime index starts at zero. */
export function splitSpeakerNoteSteps(markdown: string): SpeakerNoteSection[] {
  const sections: SpeakerNoteSection[] = [];
  let lines: string[] = [];
  let step: number | undefined;
  let fence: { marker: string; length: number } | undefined;
  const flush = () => {
    const text = lines.join("\n").trim();
    if (text) sections.push({ markdown: text, step });
    lines = [];
  };
  for (const line of markdown.split(/\r?\n/)) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) fence = { marker: marker[0], length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length && !line.slice(fenceMatch[0].length).trim()) fence = undefined;
      lines.push(line);
      continue;
    }
    const prefix = !fence && /^(\d+)[.:)]\s+/.exec(line);
    if (prefix && Number(prefix[1]) >= 1) {
      flush();
      step = Number(prefix[1]) - 1;
    }
    lines.push(line);
  }
  flush();
  return sections;
}

export function speakerNoteOpacity(section: SpeakerNoteSection, currentStep: number) {
  return section.step === undefined || section.step === currentStep ? 1 : 0.55;
}

/** Keep step labels as editable text rather than native ordered-list decorations. */
export function speakerNotesEditorMarkdown(markdown: string, restore = false): string {
  let fence: { marker: string; length: number } | undefined;
  return markdown.split(/(\r?\n)/).map(line => {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (match) {
      const marker = match[1];
      if (!fence) fence = { marker: marker[0], length: marker.length };
      else if (marker[0] === fence.marker && marker.length >= fence.length && !line.slice(match[0].length).trim()) fence = undefined;
      return line;
    }
    if (fence) return line;
    return restore
      ? line.replace(/^(\d+)\\([.)])(?=\s)/, "$1$2")
      : line.replace(/^(\d+)([.)])(?=\s)/, "$1\\$2");
  }).join("");
}
