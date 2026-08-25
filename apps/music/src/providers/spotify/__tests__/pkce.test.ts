import { getSecureStorage } from "@legend-apps/secure-storage";
import { createPKCE } from "../pkce";

describe("createPKCE", () => {
    it("uses native cryptographic randomness for the verifier and state", async () => {
        const randomBase64Url = jest.mocked(getSecureStorage().randomBase64Url);
        randomBase64Url
            .mockReturnValueOnce("v".repeat(64))
            .mockReturnValueOnce("state-from-secure-randomness");

        const result = await createPKCE();

        expect(randomBase64Url).toHaveBeenNthCalledWith(1, 48);
        expect(randomBase64Url).toHaveBeenNthCalledWith(2, 24);
        expect(result.verifier).toBe("v".repeat(64));
        expect(result.state).toBe("state-from-secure-randomness");
        expect(result.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
});
