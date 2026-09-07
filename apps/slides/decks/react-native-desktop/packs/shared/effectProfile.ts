export type EffectIntensity = "light" | "heavy";
export type EffectTempo = "slow" | "fast";

export type EffectProfileProps = {
  durationSeconds?: number;
  intensity?: EffectIntensity;
  previewProgress?: number;
  tempo?: EffectTempo;
};

export function effectAmount(intensity: EffectIntensity | undefined, light: number, heavy: number) {
  return intensity === "light" ? light : heavy;
}

export function effectDuration(
  tempo: EffectTempo | undefined,
  durationSeconds: number | undefined,
  slow: number,
  fast: number,
) {
  return Math.max(0.2, durationSeconds ?? (tempo === "slow" ? slow : fast));
}

export function loopTime(time: number, duration: number, hold = 0.9) {
  return time % (duration + hold);
}
