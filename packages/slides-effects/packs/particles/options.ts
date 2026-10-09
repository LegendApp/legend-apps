export type ParticleOptions = { particleCount?: number; speed?: number; scale?: number };
export function particleOptions(options: ParticleOptions, defaultCount: number) {
  const { particleCount = defaultCount, speed = 1, scale = 1 } = options;
  if (!Number.isInteger(particleCount) || particleCount < 1 || particleCount > 16384 || !Number.isFinite(speed) || speed < 0 || !Number.isFinite(scale) || scale <= 0) throw new Error("Invalid particle count, speed or scale");
  return { particleCount, speed, scale };
}
