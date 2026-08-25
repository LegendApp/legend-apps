const unavailable = {
    available: false,
    reason: "Apple Music is unavailable in tests.",
};

const appleMusic = {
    getAvailability: jest.fn(() => unavailable),
    getAuthorization: jest.fn(async () => ({
        authorized: false,
        status: "denied",
        storefront: "",
        userName: "",
        subscription: "",
    })),
    authorize: jest.fn(async () => ({
        authorized: false,
        status: "denied",
        storefront: "",
        userName: "",
        subscription: "",
    })),
    request: jest.fn(async () => "{}"),
    logout: jest.fn(async () => undefined),
    loadTrack: jest.fn(async () => undefined),
    play: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    seek: jest.fn(async () => undefined),
    setVolume: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    getPlaybackState: jest.fn(async () => ({
        isPlaying: false,
        positionSeconds: 0,
        durationSeconds: 0,
        artworkUrl: "",
        isLoading: false,
        error: "",
    })),
};

module.exports = {
    getAppleMusic: jest.fn(() => appleMusic),
};
