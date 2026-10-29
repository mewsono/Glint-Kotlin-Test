package dev.glint.platform

import dev.glint.app.GlintStore

/** Web preview: Drive sync is implemented on Android only. */
private class DriveSyncUnavailable(private val store: GlintStore) : DriveSyncApi {
    override val available: Boolean = false
    override fun statusLine(): String = "Google Drive sync is available on Android only."
    override fun isBusy(): Boolean = false
    override fun connect() { store.showToast("Google Drive sync is available on Android only") }
    override fun disconnect() {}
    override fun syncNow() { store.showToast("Google Drive sync is available on Android only") }
    override fun markDirty() {}
}

actual object DriveSync {
    actual fun create(store: GlintStore): DriveSyncApi = DriveSyncUnavailable(store)
}
