package app.omnileaf

import android.content.Context

internal fun interface InstalledRelease {
    fun version(): ReleaseVersion?
}

internal class PackageInstalledRelease(
    private val context: Context,
) : InstalledRelease {
    override fun version(): ReleaseVersion? {
        val versionName: String? = context.packageManager.getPackageInfo(context.packageName, 0).versionName
        return versionName?.let(ReleaseVersion::parse)
    }
}
