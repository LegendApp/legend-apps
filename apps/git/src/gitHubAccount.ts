import { useSyncExternalStore } from "react";
import { createGitHubClient, gitHubApiUrl, type GitHubClient } from "./github";

/** The GitHub account the app reads pull requests with; the token itself stays out of this state (and out of React). */
export type GitHubAccountState = { status: "loading" | "signed-out" | "signed-in"; login: string | null };

export type AccountStorage = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };

const tokenKey = "github.com.token";
const loginKey = "github.com.login";

/**
 * One account for every window: the token lives in the Keychain (Spark secure storage). Signing in checks the token
 * with `GET /user` before it is kept; signing out deletes it.
 */
export function createGitHubAccount(storage: () => AccountStorage, clientFor: (token: string, apiUrl: string) => Pick<GitHubClient, "user"> = (token, apiUrl) => createGitHubClient({ token, apiUrl })) {
  let state: GitHubAccountState = { status: "loading", login: null };
  let token: string | null = null;
  let loading: Promise<void> | null = null;
  // Bumped by sign-out, so a sign-in still checking its token doesn't sign back in afterwards.
  let generation = 0;
  const listeners = new Set<() => void>();
  const set = (next: GitHubAccountState, nextToken: string | null) => { token = nextToken; state = next; for (const listener of listeners) listener(); };
  const load = () => loading ??= Promise.all([storage().get(tokenKey), storage().get(loginKey)]).then(([saved, login]) => {
    if (state.status === "loading") set(saved ? { status: "signed-in", login } : { status: "signed-out", login: null }, saved);
  }).catch(error => {
    console.error("Couldn’t read the GitHub token from the keychain", error instanceof Error ? error.name : "");
    loading = null;
    if (state.status === "loading") set({ status: "signed-out", login: null }, null);
  });
  return {
    get: () => state,
    token: () => token,
    subscribe(listener: () => void) { listeners.add(listener); void load(); return () => { listeners.delete(listener); }; },
    load,
    /** Checks the token with GitHub, then keeps it; rejects with GitHub's error (the token is never in it). */
    async signIn(value: string, apiUrl = gitHubApiUrl) {
      const candidate = value.trim();
      if (!candidate) throw new Error("Enter a token.");
      const started = generation;
      const user = await clientFor(candidate, apiUrl).user();
      if (started !== generation) throw new Error("Signed out while signing in.");
      // The login first: a saved token is what makes the next launch signed in.
      await storage().set(loginKey, user.login);
      await storage().set(tokenKey, candidate);
      set({ status: "signed-in", login: user.login }, candidate);
      return user;
    },
    /** Deletes the token first; when the keychain refuses, the account stays signed in and this rejects. */
    async signOut() {
      generation += 1;
      await storage().remove(tokenKey);
      set({ status: "signed-out", login: null }, null);
      await storage().remove(loginKey).catch(() => {});
    },
  };
}

type Run = typeof import("@legendapp/spark/processes").runCommand;
/** The token GitHub CLI is signed in with for github.com, or null when `gh` is missing or signed out. */
export async function gitHubCliToken(run: Run = (require("@legendapp/spark/processes") as typeof import("@legendapp/spark/processes")).runCommand) {
  try {
    const result = await run({ target: { type: "command", name: "gh" }, args: ["auth", "token", "--hostname", "github.com"], timeoutMs: 10_000, captureLimitBytes: 4096 });
    const value = new TextDecoder().decode(result.stdout).trim();
    return result.exit.type === "exited" && result.exit.code === 0 && /^[\w-]+$/.test(value) ? value : null;
  } catch { return null; }
}

// Required on first use, so tests and code that never signs in don't load the native module.
const secureStorage = () => require("@legendapp/spark/secure-storage") as typeof import("@legendapp/spark/secure-storage");
export const gitHubAccount = createGitHubAccount(() => ({
  get: key => secureStorage().getItemAsync(key),
  set: (key, value) => secureStorage().setItemAsync(key, value),
  remove: key => secureStorage().deleteItemAsync(key),
}));

export function useGitHubAccount() {
  return useSyncExternalStore(gitHubAccount.subscribe, gitHubAccount.get);
}
