import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { settings$ } from "../../systems/Settings";
import {
    ensureSpotifyAccessToken,
    handleSpotifyPlayerError,
    handleSpotifyPlayerReady,
    handleSpotifyPlayerState,
    setSpotifyPlayerActivator,
    spotifyWebPlayer$,
} from "./provider";

type PlayerMessage =
    | { type: "ready"; deviceId: string }
    | { type: "state"; state: unknown }
    | { type: "error"; message: string }
    | { type: "token-request" };

const playerHtml = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><script>
window.__legendToken = "";
window.__legendPlayer = null;
const send = (payload) => window.ReactNativeWebView.postMessage(JSON.stringify(payload));
const updateState = (state) => send({ type: "state", state });
window.onSpotifyWebPlaybackSDKReady = () => {
  const player = new Spotify.Player({
    name: "Legend Music",
    getOAuthToken: (callback) => {
      if (window.__legendToken) callback(window.__legendToken);
      else send({ type: "token-request" });
    },
    volume: 0.5
  });
  window.__legendPlayer = player;
  player.addListener("ready", ({ device_id }) => send({ type: "ready", deviceId: device_id }));
  player.addListener("not_ready", () => send({ type: "error", message: "Spotify's playback device went offline." }));
  player.addListener("initialization_error", ({ message }) => send({ type: "error", message }));
  player.addListener("authentication_error", ({ message }) => send({ type: "error", message }));
  player.addListener("account_error", ({ message }) => send({ type: "error", message: "Premium account required. " + message }));
  player.addListener("playback_error", ({ message }) => send({ type: "error", message }));
  player.addListener("player_state_changed", updateState);
  player.connect();
  setInterval(async () => {
    try { updateState(await player.getCurrentState()); } catch (_) {}
  }, 1000);
};
function receive(event) {
  try {
    const message = JSON.parse(event.data);
    if (message.type === "token") window.__legendToken = message.token || "";
    if (message.type === "activate" && window.__legendPlayer) window.__legendPlayer.activateElement();
  } catch (_) {}
}
window.addEventListener("message", receive);
document.addEventListener("message", receive);
</script><script src="https://sdk.scdn.co/spotify-player.js"></script></body></html>`;

export function SpotifyWebPlayerBridge() {
    const enabled = useValue(settings$.providers.spotify.enabled);
    const refreshToken = useValue(settings$.providers.spotify.refreshToken);
    const accessToken = useValue(settings$.providers.spotify.accessToken);
    const webViewRef = useRef<WebView>(null);
    const connected = enabled && Boolean(refreshToken || accessToken);

    const send = useCallback((message: object) => {
        webViewRef.current?.postMessage(JSON.stringify(message));
    }, []);

    useEffect(() => {
        setSpotifyPlayerActivator(() => send({ type: "activate" }));
        return () => setSpotifyPlayerActivator(null);
    }, [send]);

    useEffect(() => {
        if (!connected) return;
        void ensureSpotifyAccessToken()
            .then((token) => send({ type: "token", token }))
            .catch((error) => handleSpotifyPlayerError(error instanceof Error ? error.message : String(error)));
    }, [accessToken, connected, refreshToken, send]);

    const handleMessage = useCallback((event: WebViewMessageEvent) => {
        let message: PlayerMessage;
        try {
            message = JSON.parse(event.nativeEvent.data) as PlayerMessage;
        } catch {
            handleSpotifyPlayerError("Legend Music could not read Spotify's player response.");
            return;
        }
        switch (message.type) {
            case "ready":
                handleSpotifyPlayerReady(message.deviceId);
                break;
            case "state":
                handleSpotifyPlayerState(message.state as Parameters<typeof handleSpotifyPlayerState>[0]);
                break;
            case "error":
                handleSpotifyPlayerError(message.message);
                break;
            case "token-request":
                void ensureSpotifyAccessToken()
                    .then((token) => send({ type: "token", token }))
                    .catch((error) => handleSpotifyPlayerError(error instanceof Error ? error.message : String(error)));
                break;
        }
    }, [send]);

    const source = useMemo(() => ({ html: playerHtml, baseUrl: "https://sdk.scdn.co" }), []);
    if (!connected) return null;

    return (
        <View pointerEvents="none" className="absolute left-0 top-0 h-px w-px opacity-[0.01]">
            <WebView
                ref={webViewRef}
                source={source}
                originWhitelist={["https://*"]}
                onMessage={handleMessage}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                onLoadEnd={() => {
                    const token = spotifyWebPlayer$.token.peek();
                    if (token) send({ type: "token", token });
                }}
            />
        </View>
    );
}
