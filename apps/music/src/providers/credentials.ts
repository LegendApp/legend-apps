import { getSecureStorage } from "@legend-apps/secure-storage";
import { observable } from "@legendapp/state";
import { settings$ } from "../systems/Settings";

const CREDENTIAL_NAMESPACE = "so.legend.music.providers";

type SpotifyCredentialKey = "accessToken" | "refreshToken" | "codeVerifier" | "codeState";
type AppleMusicCredentialKey = "developerToken" | "userToken";

type SpotifyCredentials = Record<SpotifyCredentialKey, string>;
type AppleMusicCredentials = Record<AppleMusicCredentialKey, string>;
type LegacyProviderSettings = {
    spotify: Partial<SpotifyCredentials>;
    appleMusic: Partial<AppleMusicCredentials>;
};

const SPOTIFY_KEYS: SpotifyCredentialKey[] = ["accessToken", "refreshToken", "codeVerifier", "codeState"];
const APPLE_MUSIC_KEYS: AppleMusicCredentialKey[] = ["developerToken", "userToken"];

export const providerCredentials$ = observable({
    spotify: {
        accessToken: "",
        refreshToken: "",
        codeVerifier: "",
        codeState: "",
    } satisfies SpotifyCredentials,
    appleMusic: {
        developerToken: "",
        userToken: "",
    } satisfies AppleMusicCredentials,
    error: null as string | null,
});

let initialized = false;

function account(provider: "spotify" | "appleMusic", key: string): string {
    return `${provider}.${key}`;
}

function actionableCredentialError(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return "Secure storage is unavailable. Unlock your login keychain, restart Legend Music, and reconnect your music services.";
}

function loadOrMigrate(provider: "spotify" | "appleMusic", key: string, legacyValue: string): string {
    const storage = getSecureStorage();
    const stored = storage.get(CREDENTIAL_NAMESPACE, account(provider, key));
    if (stored) return stored;
    if (legacyValue) {
        storage.set(CREDENTIAL_NAMESPACE, account(provider, key), legacyValue);
    }
    return legacyValue;
}

function removeLegacyFields(settings: unknown, keys: readonly string[]): void {
    const fields = settings as Record<string, { delete(): void }>;
    keys.forEach((key) => fields[key].delete());
}

export function initializeProviderCredentials(): void {
    if (initialized) return;
    try {
        const spotifyLegacy = settings$.providers.spotify.peek() as unknown as LegacyProviderSettings["spotify"];
        const appleMusicLegacy = settings$.providers.appleMusic.peek() as unknown as LegacyProviderSettings["appleMusic"];
        const spotify = Object.fromEntries(SPOTIFY_KEYS.map((key) => [
            key,
            loadOrMigrate("spotify", key, spotifyLegacy?.[key] ?? ""),
        ])) as SpotifyCredentials;
        const appleMusic = Object.fromEntries(APPLE_MUSIC_KEYS.map((key) => [
            key,
            loadOrMigrate("appleMusic", key, appleMusicLegacy?.[key] ?? ""),
        ])) as AppleMusicCredentials;

        providerCredentials$.assign({ spotify, appleMusic, error: null });
        removeLegacyFields(settings$.providers.spotify, SPOTIFY_KEYS);
        removeLegacyFields(settings$.providers.appleMusic, APPLE_MUSIC_KEYS);
        initialized = true;
    } catch (error) {
        providerCredentials$.error.set(actionableCredentialError(error));
    }
}

function storeValues<T extends Record<string, string>>(
    provider: "spotify" | "appleMusic",
    values: Partial<T>,
): void {
    const storage = getSecureStorage();
    for (const [key, value] of Object.entries(values)) {
        if (value) storage.set(CREDENTIAL_NAMESPACE, account(provider, key), value);
        else storage.remove(CREDENTIAL_NAMESPACE, account(provider, key));
    }
    providerCredentials$[provider].assign(values);
    providerCredentials$.error.set(null);
}

export function setSpotifyCredentials(values: Partial<SpotifyCredentials>): void {
    storeValues<SpotifyCredentials>("spotify", values);
}

export function setAppleMusicCredentials(values: Partial<AppleMusicCredentials>): void {
    storeValues<AppleMusicCredentials>("appleMusic", values);
}

export function clearSpotifyCredentials(): void {
    setSpotifyCredentials({ accessToken: "", refreshToken: "", codeVerifier: "", codeState: "" });
}

export function clearAppleMusicCredentials(): void {
    setAppleMusicCredentials({ developerToken: "", userToken: "" });
}
