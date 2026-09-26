# Legend Photos

macOS Photos app hosted by the shared shell and Legend Spark. Migrated from
`LegendApp/legend-photos` at `e0e3d0094a12dc4e13be767c9fb6aadecc2aa929` (MIT).

```sh
bun photos run macos
bun photos verify macos
bun run spark photos analyze
bun test apps/photos/tests
```

The app uses the workspace React 19 / React Native macOS 0.81, Legend List 3,
Legend State, Motion, Uniwind, and Spark dependencies. Spark owns windows, menus,
keyboard events, controls, filesystem access, persistence and updates. PhotoKit
and the native color panel are workspace TurboModules. React Native's image
component owns image loading and recycling; the old custom image view and host
AppDelegate are not used.

Existing `Documents/.legendphotos/{settings,metadata,hotkeys,theme}.json` files
remain in place. Local photo paths and PhotoKit asset identifiers remain metadata
keys. Release bundle identity is `com.legendapp.legend-photos`; the old debug
configuration inconsistently used a capital `Photos`. Photos permission may need
approval when switching from that development build. The Sparkle public key is
retained. New releases use legend-apps' architecture-specific update feeds; an
old-repository bridge release/feed update is a separate publishing operation.

For runtime QA without changing personal settings or requesting Photos access:

```sh
bun photos run macos -- --photos-test-session=migration --photos-test-library=/absolute/path/to/fixtures
```

Test sessions use `Library/Application Support/Legend Photos/.legendphotos-tests/<session>/` and skip Apple Photos
permission requests. Ordinary launches retain the Apple Photos source. PhotoKit
still materializes image data for albums (including iCloud assets); this migration
does not claim to optimize large cloud libraries or implement video playback.
The old optional Aptabase integration is omitted: it depended on a patched legacy
native bridge and an external build-time key. No telemetry is sent by this app.
