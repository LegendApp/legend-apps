// @ts-nocheck Execute the WebView's real embedded player script with an SDK boundary.
const React = require("react");
const { act, create } = require("react-test-renderer");
const vm = require("node:vm");
jest.mock("react-native-webview", () => ({ WebView: "webview" }));
jest.mock("../provider", () => ({
    ...jest.requireActual("../provider"),
    ensureSpotifyAccessToken: jest.fn(async () => "token"),
}));
const { settings$ } = require("../../../systems/Settings");
const { providerCredentials$ } = require("../../credentials");
const { SpotifyWebPlayerBridge } = require("../SpotifyWebPlayerBridge");

test("Spotify polls only while SDK state says it is playing; SDK events resume polling", async () => {
    settings$.providers.spotify.enabled.set(true);
    providerCredentials$.spotify.accessToken.set("token");
    let tree;
    await act(() => { tree = create(<SpotifyWebPlayerBridge />); });
    const html = tree.root.findByType("webview").props.source.html;
    const listeners = {};
    const player = { addListener: (name, handler) => { listeners[name] = handler; }, connect: jest.fn(), getCurrentState: jest.fn(async () => ({ paused: false })) };
    let tick;
    const window = { ReactNativeWebView: { postMessage: jest.fn() }, addEventListener: jest.fn() };
    vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
        window, document: { addEventListener: jest.fn() }, Spotify: { Player: function () { return player; } },
        setInterval: callback => { tick = callback; },
    });
    window.onSpotifyWebPlaybackSDKReady();
    await tick();
    expect(player.getCurrentState).not.toHaveBeenCalled();
    listeners.player_state_changed({ paused: false });
    await tick();
    expect(player.getCurrentState).toHaveBeenCalledTimes(1);
    listeners.player_state_changed({ paused: true });
    await tick();
    expect(player.getCurrentState).toHaveBeenCalledTimes(1);
    listeners.player_state_changed({ paused: false });
    await tick();
    expect(player.getCurrentState).toHaveBeenCalledTimes(2);
    await act(() => tree.unmount());
});
