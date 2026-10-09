export const titleEntranceEffects = [
  { id: "soft-rise", label: "Soft rise", unit: "title" },
  { id: "word-lift", label: "Word lift", unit: "word" },
  { id: "letter-wave", label: "Letter wave", unit: "letter" },
  { id: "center-out", label: "Center out", unit: "letter" },
  { id: "tracking-collapse", label: "Tracking collapse", unit: "letter" },
  { id: "split-arrival", label: "Split arrival", unit: "word" },
  { id: "zipper", label: "Zipper", unit: "letter" },
  { id: "elastic-drop", label: "Elastic drop", unit: "word" },
  { id: "hinge", label: "Hinge", unit: "word" },
  { id: "spin-in", label: "Spin in", unit: "letter" },
  { id: "scatter", label: "Scatter", unit: "letter" },
  { id: "stretch-release", label: "Stretch release", unit: "word" },
  { id: "typewriter", label: "Typewriter", unit: "letter" },
  { id: "wipe", label: "Left-to-right wipe", unit: "title" },
  { id: "curtain", label: "Center curtain", unit: "title" },
  { id: "chromatic-glitch", label: "Chromatic glitch", unit: "title" },
] as const;

export type TitleEntranceEffect = typeof titleEntranceEffects[number]["id"];
export type TitleEntranceFrame = {
  x: number; y: number; opacity: number; scaleX: number; scaleY: number;
  rotate: number; rotateX: number; reveal: number; ghost: number;
};

const settled: TitleEntranceFrame = {
  x: 0, y: 0, opacity: 1, scaleX: 1, scaleY: 1, rotate: 0, rotateX: 0, reveal: 1, ghost: 0,
};

function titleEntranceSpeed(effect: TitleEntranceEffect) {
  "worklet";
  switch (effect) {
    case "word-lift": case "letter-wave": case "center-out": case "split-arrival":
    case "zipper": case "elastic-drop": case "hinge": case "scatter": case "stretch-release":
      return 1.75;
    default: return 1;
  }
}

export function titleEntranceDuration(effect: TitleEntranceEffect) {
  const stagger = effect === "typewriter" ? 1.15 : effect === "center-out" ? 0.5
    : effect === "soft-rise" || effect === "tracking-collapse" || effect === "wipe" || effect === "curtain" || effect === "chromatic-glitch" ? 0 : 0.45;
  const duration = effect === "typewriter" ? 0.045 : effect === "elastic-drop" ? 1.05 : 0.85;
  // Clear the final progress boundary despite floating-point roundoff.
  return (0.12 + stagger + duration) / titleEntranceSpeed(effect) + 0.000001;
}

export function sampleTitleEntrance(effect: TitleEntranceEffect, seconds: number, index = 0, count = 1,
  lineIndex = index, lineCount = count): TitleEntranceFrame {
  "worklet";
  seconds *= titleEntranceSpeed(effect);
  const order = index / Math.max(1, count - 1);
  const distance = lineIndex - (lineCount - 1) / 2;
  const centerOrder = Math.abs(distance) / Math.max(1, (lineCount - 1) / 2);
  const stagger = effect === "typewriter" ? order * 1.15
    : effect === "center-out" ? centerOrder * 0.5
    : effect === "soft-rise" || effect === "tracking-collapse" || effect === "wipe" ||
      effect === "curtain" || effect === "chromatic-glitch" ? 0 : order * 0.45;
  const duration = effect === "typewriter" ? 0.045 : effect === "elastic-drop" ? 1.05 : 0.85;
  const progress = Math.max(0, Math.min(1, (seconds - 0.12 - stagger) / duration));
  if (progress >= 1) return settled;
  const eased = 1 - Math.pow(1 - progress, 3);
  const remaining = 1 - eased;
  const frame = { ...settled, opacity: Math.min(1, progress * 4) };
  switch (effect) {
    case "soft-rise": frame.y = 44 * remaining; frame.opacity = eased; break;
    case "word-lift": frame.y = 130 * remaining; break;
    case "letter-wave":
      frame.y = 90 * remaining + Math.sin(progress * Math.PI * 2) * (1 - progress) * 26;
      break;
    case "center-out": frame.x = distance * 10 * remaining; frame.y = 32 * remaining; break;
    case "tracking-collapse": frame.x = distance * 36 * remaining; break;
    case "split-arrival": frame.x = (index % 2 ? 220 : -220) * remaining; break;
    case "zipper": frame.y = (index % 2 ? -110 : 110) * remaining; frame.rotate = (index % 2 ? 8 : -8) * remaining; break;
    case "elastic-drop": frame.y = -160 * Math.exp(-6 * progress) * Math.cos(12 * progress) * (1 - progress); break;
    case "hinge": frame.rotateX = -100 * remaining; frame.y = 32 * remaining; break;
    case "spin-in":
      frame.rotate = (index % 2 ? 95 : -95) * remaining;
      frame.scaleX = frame.scaleY = 0.25 + 0.75 * eased;
      break;
    case "scatter":
      frame.x = Math.cos(index * 2.4) * 180 * remaining;
      frame.y = Math.sin(index * 2.4) * 150 * remaining;
      frame.rotate = Math.sin(index * 1.7) * 100 * remaining;
      break;
    case "stretch-release": frame.scaleX = 0.15 + 0.85 * eased; frame.scaleY = 1.8 - 0.8 * eased; break;
    case "typewriter": frame.opacity = progress > 0 ? 1 : 0; break;
    case "wipe": case "curtain": frame.reveal = eased; break;
    case "chromatic-glitch":
      frame.x = Math.sin(Math.floor(progress * 24) * 2.3) * 12 * remaining;
      frame.ghost = frame.opacity * remaining * 0.8;
      break;
  }
  return frame;
}
