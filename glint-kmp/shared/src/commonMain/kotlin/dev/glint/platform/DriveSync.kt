package dev.glint.platform

import dev.glint.app.GlintStore

/**
 * Google Drive backup sync (equivalent of the PWA's drive.js).
 *
 * Android implements the full appDataFolder flow; web reports
 * [available] = false and the settings UI shows "available on Android only".
 */
interface DriveSyncApi {
    /** Whether this platform can run Drive sync at all. */
    val available: Boolean

    /** Human status line for the settings sheet ("Not connected", "Synced 5 min ago", error text…). */
    fun statusLine(): String

    /** True while a network sync is in flight. */
    fun isBusy(): Boolean

    /** Begin interactive sign-in + first sync. No-op when `!available`. */
    fun connect()

    /** Forget tokens and stop syncing. */
    fun disconnect()

    /** Push/pull now (two-way merge, newest-wins per bookmark, deletions respected). */
    fun syncNow()

    /** Called after local changes when auto-sync is on; debounces a background sync. */
    fun markDirty()
}

expect object DriveSync {
    fun create(store: GlintStore): DriveSyncApi
}
