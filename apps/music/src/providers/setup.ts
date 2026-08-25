import { ensureMusicProviderSettings } from "../systems/Settings";
import { appleMusicProvider } from "./appleMusic/provider";
import { initializeProviderCredentials } from "./credentials";
import { refreshProviderPlaylists, registerStreamingProvider } from "./registry";
import { spotifyProvider } from "./spotify/provider";

let providersRegistered = false;
let providersInitialized = false;

export function ensureStreamingProvidersRegistered(): void {
    if (providersRegistered) return;
    ensureMusicProviderSettings();
    registerStreamingProvider(spotifyProvider);
    registerStreamingProvider(appleMusicProvider);
    providersRegistered = true;
}

export async function initializeStreamingProviders(): Promise<void> {
    ensureStreamingProvidersRegistered();
    if (providersInitialized) return;
    providersInitialized = true;
    initializeProviderCredentials();
    await Promise.allSettled([spotifyProvider.initialize(), appleMusicProvider.initialize()]);
    await refreshProviderPlaylists();
}
