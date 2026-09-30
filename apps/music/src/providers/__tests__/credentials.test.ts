describe("provider credentials", () => {
    beforeEach(() => { jest.resetModules(); });

    function load() {
        const storage = require("@legendapp/spark/secure-storage") as jest.Mocked<typeof import("@legendapp/spark/secure-storage")>;
        const credentials = require("../credentials") as typeof import("../credentials");
        return { storage, ...credentials };
    }

    it("waits for startup reads before persisting a new login", async () => {
        const { storage, initializeProviderCredentials, setSpotifyCredentials, providerCredentials$ } = load();
        let resolveRead!: (value: string) => void;
        storage.getItemAsync.mockImplementationOnce(() => new Promise(resolve => { resolveRead = resolve; }));
        const startup = initializeProviderCredentials();
        const login = setSpotifyCredentials({ accessToken: "new-token" });
        await Promise.resolve();
        expect(storage.setItemAsync).not.toHaveBeenCalled();
        resolveRead("old-token");
        await startup;
        await login;
        expect(providerCredentials$.spotify.accessToken.peek()).toBe("new-token");
        expect(storage.setItemAsync).toHaveBeenCalledWith("spotify.accessToken", "new-token");
    });

    it("serializes logout after a pending login write", async () => {
        const { storage, setSpotifyCredentials, clearSpotifyCredentials, providerCredentials$ } = load();
        let resolveWrite!: () => void;
        storage.setItemAsync.mockImplementationOnce(() => new Promise(resolve => { resolveWrite = resolve; }));
        const login = setSpotifyCredentials({ accessToken: "new-token" });
        const logout = clearSpotifyCredentials();
        while (!resolveWrite) await Promise.resolve();
        expect(storage.deleteItemAsync).not.toHaveBeenCalled();
        resolveWrite();
        await Promise.all([login, logout]);
        expect(providerCredentials$.spotify.accessToken.peek()).toBe("");
        expect(storage.deleteItemAsync).toHaveBeenCalledWith("spotify.accessToken");
    });

    it("allows retry after credential initialization fails", async () => {
        const { storage, initializeProviderCredentials, providerCredentials$ } = load();
        storage.getItemAsync.mockRejectedValueOnce(new Error("locked"));
        await expect(initializeProviderCredentials()).rejects.toThrow("locked");
        expect(providerCredentials$.error.peek()).toContain("locked");
        await initializeProviderCredentials();
        expect(providerCredentials$.error.peek()).toBeNull();
        expect(storage.getItemAsync).toHaveBeenCalledTimes(8);
    });
});
