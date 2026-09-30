import { getItemAsync, setItemAsync, deleteItemAsync } from "@legendapp/spark/secure-storage";
import { observable } from "@legendapp/state";
type SpotifyCredentialKey = "accessToken" | "refreshToken" | "codeVerifier" | "codeState";
type SpotifyCredentials = Record<SpotifyCredentialKey, string>;
const keys: SpotifyCredentialKey[] = ["accessToken", "refreshToken", "codeVerifier", "codeState"];
const keyName = (key: string) => `spotify.${key}`;
export const providerCredentials$ = observable({ spotify: { accessToken: "", refreshToken: "", codeVerifier: "", codeState: "" } as SpotifyCredentials, error: null as string | null });
let initialization: Promise<void> | undefined;
let writes = Promise.resolve();
export function initializeProviderCredentials(): Promise<void> {
    initialization ??= Promise.all(keys.map(async key => [key, await getItemAsync(keyName(key)) ?? ""] as const)).then(values => {
        providerCredentials$.assign({ spotify: Object.fromEntries(values) as SpotifyCredentials, error: null });
    }).catch(error => { initialization = undefined; providerCredentials$.error.set(String(error)); throw error; });
    return initialization;
}
export function setSpotifyCredentials(values: Partial<SpotifyCredentials>): Promise<void> {
    const snapshot = { ...values };
    const operation = writes.catch(() => {}).then(async () => {
        await initializeProviderCredentials();
        for (const [key, value] of Object.entries(snapshot)) {
            if (value) await setItemAsync(keyName(key), value);
            else await deleteItemAsync(keyName(key));
        }
        providerCredentials$.spotify.assign(snapshot);
        providerCredentials$.error.set(null);
    }).catch(error => { providerCredentials$.error.set(String(error)); throw error; });
    writes = operation;
    return operation;
}
export function clearSpotifyCredentials(): Promise<void> {
    return setSpotifyCredentials({ accessToken: "", refreshToken: "", codeVerifier: "", codeState: "" });
}
