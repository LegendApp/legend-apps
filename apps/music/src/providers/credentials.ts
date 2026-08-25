import { getSecureStorage } from "@legend-apps/secure-storage";
import { observable } from "@legendapp/state";
import { settings$ } from "../systems/Settings";

const CREDENTIAL_NAMESPACE = "so.legend.music.providers";

type SpotifyCredentialKey = "accessToken" | "refreshToken" | "codeVerifier" | "codeState";
type AppleMusicCredentialKey = "developerToken" | "userToken";

type SpotifyCredentials = Record<SpotifyCredentialKey, string>;
type LegacyProviderSettings = {
    spotify: Partial<SpotifyCredentials>;
    appleMusic: Partial<Record<AppleMusicCredentialKey, string>> & {
        connected?: boolean;
        storefront?: string;
        userName?: string;
        subscription?: string;
    };
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

function loadOrMigrate(key: SpotifyCredentialKey, legacyValue: string): string {
    const storage = getSecureStorage();
    const stored = storage.get(CREDENTIAL_NAMESPACE, account("spotify", key));
    if (stored) return stored;
    if (legacyValue) {
        storage.set(CREDENTIAL_NAMESPACE, account("spotify", key), legacyValue);
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
            loadOrMigrate(key, spotifyLegacy?.[key] ?? ""),
        ])) as SpotifyCredentials;
        const storage = getSecureStorage();
        const legacyAppleCredentials = APPLE_MUSIC_KEYS.map((key) => (
            storage.get(CREDENTIAL_NAMESPACE, account("appleMusic", key)) || appleMusicLegacy?.[key] || ""
        ));
        const hadAppleConnection = legacyAppleCredentials.every(Boolean)
            || Boolean(appleMusicLegacy?.storefront || appleMusicLegacy?.userName || appleMusicLegacy?.subscription);

        providerCredentials$.assign({ spotify, error: null });
        if (!appleMusicLegacy?.connected && hadAppleConnection) {
            settings$.providers.appleMusic.connected.set(true);
        }
        APPLE_MUSIC_KEYS.forEach((key) => storage.remove(CREDENTIAL_NAMESPACE, account("appleMusic", key)));
        removeLegacyFields(settings$.providers.spotify, SPOTIFY_KEYS);
        removeLegacyFields(settings$.providers.appleMusic, APPLE_MUSIC_KEYS);
        initialized = true;
    } catch (error) {
        providerCredentials$.error.set(actionableCredentialError(error));
    }
}

function storeSpotifyValues(values: Partial<SpotifyCredentials>): void {
    const storage = getSecureStorage();
    for (const [key, value] of Object.entries(values)) {
        if (value) storage.set(CREDENTIAL_NAMESPACE, account("spotify", key), value);
        else storage.remove(CREDENTIAL_NAMESPACE, account("spotify", key));
    }
    providerCredentials$.spotify.assign(values);
    providerCredentials$.error.set(null);
}

export function setSpotifyCredentials(values: Partial<SpotifyCredentials>): void {
    storeSpotifyValues(values);
}

export function clearSpotifyCredentials(): void {
    setSpotifyCredentials({ accessToken: "", refreshToken: "", codeVerifier: "", codeState: "" });
}
