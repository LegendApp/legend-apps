# Releasing macOS Apps

Each macOS app has an independent Sparkle feed at `updates/<app>/appcast.xml`
and an independent GitHub release tag named `<app>-v<version>`.

The Sparkle public key is committed in each app manifest. The matching private
key is stored in the local macOS Keychain under the Sparkle account `LegendApp`.

## Local Credentials

Set either a full Developer ID identity:

```sh
export LEGEND_DEVELOPER_ID_APPLICATION="Developer ID Application: Example Team (TEAMID1234)"
```

Or set team parts:

```sh
export LEGEND_TEAM_NAME="Example Team"
export LEGEND_TEAM_ID="TEAMID1234"
```

For notarization, set either a notarytool keychain profile:

```sh
export LEGEND_NOTARY_KEYCHAIN_PROFILE="legend-apps"
```

Or Apple ID credentials:

```sh
export LEGEND_APPLE_ID="you@example.com"
export LEGEND_APP_PASSWORD="app-specific-password"
export LEGEND_TEAM_ID="TEAMID1234"
```

## Package

```sh
bun run diff package macos
```

For a local unsigned package/appcast check:

```sh
bun run diff package macos --skip-sign --skip-notarize
```

The package command builds the app, signs and notarizes the copied app, creates
`dist/<app>/macos/<asset>.zip`, runs Sparkle `generate_appcast`, and writes the
feed to `updates/<app>/appcast.xml`.

## Publish

Commit and push the version and generated appcast changes to `main` before
publishing. The release command verifies that `HEAD` and the appcast match
`origin/main`, and that every archive is Developer ID signed, hardened,
notarized, stapled, Gatekeeper-approved, and built for the expected
architecture. Then run:

```sh
bun run diff githubrelease macos
```

To run the complete publication preflight without creating a tag or release:

```sh
bun run diff githubrelease macos --verify-only
```

The publish command creates the app-prefixed tag and GitHub release at the
verified `main` commit, with the packaged archive and generated delta files.

Do not use GitHub's repository-wide `/releases/latest` URLs for Sparkle feeds.
The appcasts point at fixed release asset URLs like
`/releases/download/diff-v0.0.1/Legend-Diff-0.0.1-arm.zip`.
