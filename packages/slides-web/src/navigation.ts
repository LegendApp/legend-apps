export function parsePosition(hash: string, steps: number[]) {
  const match = /^#(\d+)(?:\/(\d+))?$/.exec(hash);
  if (!match || !steps.length) return { currentSlide: 0, currentStep: 0 };
  const currentSlide = Math.max(0, Math.min(Number(match[1]) - 1, steps.length - 1));
  const currentStep = Math.max(0, Math.min(Number(match[2] ?? 1) - 1, steps[currentSlide] - 1));
  return { currentSlide, currentStep };
}

export function acceptsShortcut(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat &&
    !target?.closest("input, textarea, select, button, [contenteditable=true]");
}
