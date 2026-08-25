const loopback = {
    start: jest.fn(async () => "http://127.0.0.1:49152/spotify-callback"),
    waitForCallback: jest.fn(async () => "http://127.0.0.1:49152/spotify-callback?code=test&state=test"),
    cancel: jest.fn(),
};

module.exports = {
    getOAuthLoopback: jest.fn(() => loopback),
};
