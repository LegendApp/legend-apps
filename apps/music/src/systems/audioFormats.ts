export const SUPPORTED_AUDIO_EXTENSIONS = [
    "mp3",
    "wav",
    "m4a",
    "aac",
    "flac",
    "aif",
    "aiff",
    "aifc",
    "caf",
] as const;

// AVFoundation supports these as well; currently the list matches SUPPORTED_AUDIO_EXTENSIONS.
export const AVFOUNDATION_COMPATIBLE_EXTENSIONS = [...SUPPORTED_AUDIO_EXTENSIONS] as const;

const supportedExtensionPattern = new RegExp(`\\.(${SUPPORTED_AUDIO_EXTENSIONS.join("|")})$`, "i");
const supportedExtensionsSet = new Set<string>(SUPPORTED_AUDIO_EXTENSIONS);

export function isSupportedAudioExtension(extension?: string | null): boolean {
    if (!extension) {
        return false;
    }

    return supportedExtensionsSet.has(extension.toLowerCase());
}

export function isSupportedAudioFile(path?: string | null): boolean {
    if (!path) {
        return false;
    }

    const extension = path.split(".").pop();
    return isSupportedAudioExtension(extension);
}

export function stripSupportedAudioExtension(fileName: string): string {
    if (!fileName) {
        return fileName;
    }

    return fileName.replace(supportedExtensionPattern, "");
}
