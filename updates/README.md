# Sparkle Appcasts

Each macOS app writes its Sparkle feed to `updates/<app>/appcast.xml`.

The feed URL embedded in release builds is the raw GitHub URL for that path on
`main`. Package an app before creating the GitHub release so the appcast points
at the versioned release asset URL for the matching app tag.

