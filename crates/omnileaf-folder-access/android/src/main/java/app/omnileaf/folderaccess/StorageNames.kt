package app.omnileaf.folderaccess

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ProviderInfo
import android.net.Uri
import android.os.Build
import android.os.storage.StorageManager
import android.os.storage.StorageVolume

private const val EXTERNAL_STORAGE_AUTHORITY = "com.android.externalstorage.documents"
private const val VOLUME_SEPARATOR = ':'
private const val PRIMARY_VOLUME = "primary"

internal class StorageNames(
    private val context: Context,
) {
    private val packageManager = context.packageManager

    fun of(
        tree: Uri,
        documentId: String,
    ): String? =
        when (val authority = tree.authority) {
            null -> null
            EXTERNAL_STORAGE_AUTHORITY -> volumeDescription(documentId.substringBefore(VOLUME_SEPARATOR))
            else -> providerLabel(authority)
        }

    /** Android's external storage provider names the primary volume `primary` and every other after its UUID. */
    private fun volumeDescription(volumeId: String): String? =
        context
            .getSystemService(StorageManager::class.java)
            ?.storageVolumes
            ?.firstOrNull { it.isNamed(volumeId) }
            ?.getDescription(context)

    /** Android shows a provider's root titles only to apps holding `MANAGE_DOCUMENTS`, so its label stands in. */
    private fun providerLabel(authority: String): String? = provider(authority)?.loadLabel(packageManager)?.toString()

    private fun provider(authority: String): ProviderInfo? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            packageManager.resolveContentProvider(authority, PackageManager.ComponentInfoFlags.of(0))
        } else {
            legacyProvider(authority)
        }

    /** Android 13 deprecated this form, which is the only one before it. */
    @Suppress("DEPRECATION")
    private fun legacyProvider(authority: String): ProviderInfo? = packageManager.resolveContentProvider(authority, 0)
}

private fun StorageVolume.isNamed(volumeId: String): Boolean =
    if (volumeId == PRIMARY_VOLUME) isPrimary else uuid.equals(volumeId, ignoreCase = true)
