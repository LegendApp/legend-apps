# Releasing macOS Apps

Each macOS app has architecture-specific Sparkle feeds at
`updates/<app>/appcast-arm.xml` and `updates/<app>/appcast-x86.xml`, plus an
independent GitHub release tag named `<app>-v<version>`.

The Sparkle public key is committed in each app manifest. The matching private
key is stored in the local macOS Keychain under the Sparkle account `LegendApp`.

## Interactive workflow

From the repository root:

```sh
bun package chat-history
bun release chat-history
```

Both commands assume macOS. Omit the app name to select an app, or add `--help`
for usage. The existing non-interactive commands below remain available.

Before packaging a new version, update `apps/<app>/package.json` and increment
the macOS `release.macos.build` in `apps/<app>/app.manifest.ts`. The wizard shows
both values for confirmation. It then asks which Macs to support (Apple Silicon
and Intel by default), whether to prepare a signed distribution or unsigned
local package, and whether to build from source or reuse existing release builds.
Reused builds must already contain the selected version and build number.

Distribution packaging prepares the app changelog using the existing changelog
generator, then builds, signs, notarizes, and generates update feeds. Missing
changelog entries may require Codex CLI or Claude CLI. Local packaging skips
changelog generation, Developer ID signing, notarization, and update feeds.

After distribution packaging, review the changelog and generated feeds, then
commit and push the release changes to `main`. The wizard lists the relevant
files. Run `bun release <app>` and choose the same architectures. Select either
verification only or publication, and optionally provide a release notes file.
Publication runs the existing release checks, displays the destination, tag,
assets, and notes, then asks for confirmation (default: no).

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

## Versioning

Set the release version only in `apps/<app>/package.json`.
`CFBundleShortVersionString` uses that version; `CFBundleVersion` is derived as
`(1000 + major).minor.patch`, so `0.0.2` produces build `1000.0.2`.
The offset keeps new builds above the legacy manual build numbers `1` and `2`
for existing Sparkle installations. Missing minor/patch segments default to zero;
prerelease/build suffixes are stripped, so they do not identify distinct updates.
Rebuild and repackage after changing the version; existing ZIPs are not modified.

## Package

```sh
bun run diff package macos all
```

For a local unsigned package/appcast check:

```sh
bun run diff package macos all --skip-sign --skip-notarize
```

The package command builds the app, signs and notarizes the copied app, creates
`dist/<app>/macos/<asset>.zip`, runs Sparkle `generate_appcast` separately for
each architecture, and writes both feeds under `updates/<app>/`.

## Publish

Commit and push the version and generated appcast changes to `main` before
publishing. The release command verifies that `HEAD` and the appcast match
`origin/main`, and that every archive is Developer ID signed, hardened,
notarized, stapled, Gatekeeper-approved, and built for the expected
architecture. Then run:

```sh
bun run diff githubrelease macos all
```

To run the complete publication preflight without creating a tag or release:

```sh
bun run diff githubrelease macos all --verify-only
```

The publish command creates the app-prefixed tag and GitHub release at the
verified `main` commit, with the packaged archive and generated delta files.

Do not use GitHub's repository-wide `/releases/latest` URLs for Sparkle feeds.
The appcasts point at fixed release asset URLs like
`/releases/download/diff-v0.0.1/Legend-Diff-0.0.1-arm.zip`.
