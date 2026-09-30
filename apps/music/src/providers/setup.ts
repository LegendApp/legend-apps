import { ensureMusicProviderSettings } from "../systems/Settings";
import { appleMusicProvider } from "./appleMusic/provider";
import { initializeProviderCredentials } from "./credentials";
import { refreshProviderPlaylists, registerStreamingProvider } from "./registry";
import { spotifyProvider } from "./spotify/provider";

let providersRegistered = false;
let initialization: Promise<void> | undefined;

export function ensureStreamingProvidersRegistered(): void {
    if (providersRegistered) return;
    ensureMusicProviderSettings();
    registerStreamingProvider(spotifyProvider);
    registerStreamingProvider(appleMusicProvider);
    providersRegistered = true;
}

export function initializeStreamingProviders(): Promise<void> {
    ensureStreamingProvidersRegistered();
    initialization ??= (async () => {
        await initializeProviderCredentials();
        await Promise.allSettled([spotifyProvider.initialize(), appleMusicProvider.initialize()]);
        await refreshProviderPlaylists();
    })().catch(error => {
        initialization = undefined;
        throw error;
    });
    return initialization;
}
