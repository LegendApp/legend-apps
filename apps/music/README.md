# Legend Music

Legend Music is a local-first music player centered on folders and files you control. It scans local libraries, reads media metadata and artwork, manages a persistent playback queue, and supports local `.m3u` playlists.

## Current scope

- scan one or more library folders and cache track metadata and artwork
- play MP3, WAV, M4A, AAC, FLAC, AIFF, and CAF-family files through the native audio player
- browse and search the local library, albums, artists, and playlists
- manage queue order with next, previous, shuffle, repeat, volume, and timeline controls
- restore queue and playback state across launches
- create, rename, delete, import, export, and edit local `.m3u` playlists
- add tracks through file dialogs, native drag and drop, library actions, and playlist actions
- show a configurable current-song overlay and register playback hotkeys
- customize themes, translucent backgrounds, and the visible playback-control layout
- optionally extend a playlist from the local library with an installed Claude or Codex CLI
- use native macOS menus, media keys, multiple utility windows, and Sparkle updates

The app manifest enables macOS, iOS, and Android development targets. The full local-library, multi-window, hotkey, overlay, and desktop-menu experience is currently macOS-first.

## Run

macOS development from the repository root:

```sh
bun run music start macos
bun run music run macos
```

For a generated mobile project:

```sh
bun run music prebuild ios
bun run music run ios

bun run music prebuild android
bun run music run android
```

Open an existing macOS development build without rebuilding:

```sh
bun run music open macos
```

The Music dev server uses port `19091` by default.

## Validate

```sh
bun run test:music --runInBand
bun run music verify macos
bun run music verify ios
bun run music verify android
bun run typecheck
```

The Jest suite covers queue invariants, track resolution, playlist drops, themes, library views, local playlists, menus, layout state, and AI playlist helpers. Playback and media-library changes should still receive a manual native smoke test on the affected platform.

## Key files

- `app.manifest.ts` declares supported platforms, native modules, identity, and macOS release metadata.
- `src/App.tsx` composes the main window and the settings, library, and overlay window managers.
- `src/components/LocalAudioPlayer.tsx` owns native playback, queue state, progress, and persistence.
- `src/systems/LocalMusicState.ts` and `src/systems/LibraryState.ts` own scanning and library state.
- `src/systems/LocalPlaylists.ts` and `src/utils/m3u.ts` own playlist persistence and interchange.
- `src/settings/` contains library, overlay, appearance, and UI customization.
