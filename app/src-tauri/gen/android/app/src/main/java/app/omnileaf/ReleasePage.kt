package app.omnileaf

internal fun releasePageAddress(version: ReleaseVersion): String? =
    "https://github.com/$OMNILEAF_REPOSITORY/releases/tag/v$version".takeIf { version.preRelease == null }
