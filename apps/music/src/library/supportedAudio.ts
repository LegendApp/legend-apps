export const supportedAudioExtensions = [
  "aac",
  "aif",
  "aiff",
  "alac",
  "flac",
  "m4a",
  "mp3",
  "ogg",
  "wav",
] as const;

export function isSupportedAudioPath(path: string) {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return supportedAudioExtensions.includes(extension as (typeof supportedAudioExtensions)[number]);
}
