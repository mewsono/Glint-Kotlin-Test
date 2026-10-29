package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.glint.app.GlintStore
import dev.glint.app.Overlay
import dev.glint.core.*
import dev.glint.model.AuthRecord
import dev.glint.sources.Accounts
import dev.glint.sources.Sources
import kotlinx.coroutines.launch

/** Bottom sheet container: radius 22, max width 520, chip-coloured card. */
@Composable
fun Sheet(store: GlintStore, title: String, content: @Composable () -> Unit) {
    val colors = G.colors
    Box(Modifier.fillMaxSize()) {
        Scrim { store.pop() }
        Box(Modifier.align(Alignment.BottomCenter).widthIn(max = 520.dp).fillMaxWidth()) {
            Column(
                Modifier
                    .clip(RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
                    .background(colors.bg)
                    .heightIn(max = 640.dp)
                    .padding(bottom = 10.dp),
            ) {
                Row(
                    Modifier.fillMaxWidth().padding(start = 20.dp, end = 14.dp, top = 18.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(title, size = 28f, serif = true, modifier = Modifier.weight(1f))
                    Chip("Done") { store.pop() }
                }
                Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
                    content()
                }
            }
        }
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(
        text, color = G.colors.mu, size = 13f, weight = FontWeight.SemiBold,
        modifier = Modifier.padding(start = 6.dp, top = 16.dp, bottom = 6.dp),
    )
}

@Composable
fun Note(text: String) {
    Text(text, color = G.colors.mu, size = 12.5f, lineHeight = 17f, modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp))
}

/** Text input field (PWA .field). */
@Composable
fun Field(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    label: String = "",
    password: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val colors = G.colors
    Column(modifier.fillMaxWidth().padding(vertical = 5.dp)) {
        if (label.isNotEmpty()) {
            Text(label, color = colors.mu, size = 12f, weight = FontWeight.Medium, modifier = Modifier.padding(start = 6.dp, bottom = 4.dp))
        }
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.chip)
                .padding(horizontal = 13.dp, vertical = 12.dp),
        ) {
            if (value.isEmpty()) Text(placeholder, color = colors.mu, size = 14f)
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TextStyle(color = colors.tx, fontSize = 14.sp, fontFamily = G.body),
                cursorBrush = SolidColor(colors.ac),
                visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/* --------------------------------------------------------------- settings */

@Composable
fun SettingsSheet(store: GlintStore) {
    val colors = G.colors
    Sheet(store, "Settings") {
        SectionTitle("Sources")
        Note("Choose the source for your image wall. Accounts and custom sources are available below.")
        store.state.srcs.filter { Sources.all[it]?.off == false }.forEach { id ->
            val s = Sources.source(id)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                        .press { store.pickSource(id) }
                        .padding(horizontal = 12.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(s.name, size = 15f, weight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    if (store.state.src == id && store.state.mode == "live") GlintIcon(Glyph.Check, colors.ac, 18.dp)
                }
                GlintIcon(Glyph.Edit, colors.mu, 17.dp, Modifier.press { store.push(Overlay.SourceInfo(id)) }.padding(6.dp))
                GlintIcon(Glyph.Trash, colors.mu, 17.dp, Modifier.press { store.push(Overlay.ConfirmDeleteSource(id)) }.padding(6.dp))
            }
        }
        SheetRow("Manage sources") { store.push(Overlay.SourcesSheet) }
        SectionTitle("Columns")
        Seg(listOf("1" to "1", "2" to "2", "3" to "3"), store.state.cols.toString()) { store.setCols(it.toInt()) }
        SectionTitle("Appearance")
        Seg(listOf("light" to "Light", "dark" to "Dark", "system" to "System"), store.state.theme) { store.setTheme(it) }
        SectionTitle("Your library")
        SheetRow("Bookmarks, likes & explore") { store.push(Overlay.LibrarySheet) }
        SheetRow("Source accounts") { store.push(Overlay.AccountsSheet) }
        SheetRow("Export bookmarks", trailing = "↓") { store.exportBookmarks() }
        SheetRow("Import bookmarks", trailing = "↑") { store.importBookmarks() }
        SectionTitle("Sync & more")
        SheetRow("Google Drive sync", trailing = if (store.state.driveOn) "Connected" else "Connect") {
            if (store.drive.available) store.drive.connect() else store.showToast("Google Drive sync is available on Android only")
        }
        SheetRow("Quality, Drive setup & advanced") { store.push(Overlay.AdvancedSheet) }
        Box(Modifier.padding(bottom = 16.dp))
    }
}

/* -------------------------------------------------------- library + saved */

@Composable
fun LibrarySheet(store: GlintStore) {
    Sheet(store, "Your library") {
        Note("Saved here. Ready when you are.")
        store.savedTabs().forEach { tab ->
            SheetRow(tab) {
                store.closeAllOverlays()
                store.nav(dev.glint.app.Screen.Profile)
                store.setSavedTab(tab)
            }
        }
        SheetRow("Search & filter saved images") {
            store.closeAllOverlays()
            store.nav(dev.glint.app.Screen.Profile)
            store.setSavedTab("Bookmarks")
            store.bookmarkSearchOpen = true
        }
        SheetRow("Search all images") {
            store.closeAllOverlays()
            store.nav(dev.glint.app.Screen.Search)
        }
        Box(Modifier.padding(bottom = 16.dp))
    }
}

@Composable
fun SavedSourcesSheet(store: GlintStore) {
    val colors = G.colors
    val rows = store.bookmarkRows()
    val options = listOf(Triple("all", "All sources", rows.size)) + store.bookmarkSourceOptions(rows)
    Sheet(store, "Bookmark sources") {
        options.forEach { (id, name, count) ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .press { store.bookmarkSource = id; store.pop() }
                    .padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(name, size = 15f, weight = FontWeight.Medium, modifier = Modifier.weight(1f))
                Text("$count " + if (store.bookmarkSource == id) "✓" else "", color = colors.mu, size = 13f)
            }
        }
        Box(Modifier.padding(bottom = 16.dp))
    }
}

/* ----------------------------------------------------------- source sheets */

@Composable
fun SourcesSheet(store: GlintStore) {
    val colors = G.colors
    Sheet(store, "Image sources") {
        SectionTitle("Your sources")
        store.state.srcs.filter { Sources.has(it) }.forEach { id ->
            val s = Sources.source(id)
            SheetRow(s.name, trailing = if (store.state.src == id && store.state.mode == "live") "✓" else "") {
                store.pickSource(id); store.pop()
            }
        }
        SheetRow("Demo artwork", trailing = if (store.state.mode == "demo") "✓" else "") {
            store.setMode("demo"); store.showToast("Demo artwork"); store.pop()
        }
        SectionTitle("Add a preset source")
        Sources.order.filter { it !in store.state.srcs && Sources.all[it]?.off == false && Sources.all[it]?.custom == false }.forEach { id ->
            val s = Sources.source(id)
            SheetRow(s.name + if (s.note.isNotEmpty()) " · " + s.note else "", trailing = "+") {
                store.addSourceToRow(id)
                store.showToast(s.name + " added")
            }
        }
        val offOnes = Sources.order.filter { Sources.all[it]?.off == true }
        if (offOnes.isNotEmpty()) {
            SectionTitle("Unavailable")
            offOnes.forEach { id ->
                val s = Sources.source(id)
                Note(s.name + " — " + s.note.ifEmpty { "unavailable in this app" })
            }
        }
        SectionTitle("Custom sources")
        Note("Add any Danbooru, Moebooru, e621, Gelbooru or Philomena site by URL.")
        Sources.order.filter { Sources.all[it]?.custom == true }.forEach { id ->
            val s = Sources.source(id)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(s.name, size = 15f, weight = FontWeight.Medium, modifier = Modifier.weight(1f).padding(start = 12.dp))
                Chip("Edit") { store.push(Overlay.CustomSourceSheet(id)) }
                Box(Modifier.padding(4.dp))
                Chip("Delete") { store.push(Overlay.ConfirmDeleteSource(id)) }
            }
        }
        SheetRow("Add a custom source", trailing = "+") { store.push(Overlay.CustomSourceSheet()) }
        Box(Modifier.padding(bottom = 16.dp))
    }
}

@Composable
fun CustomSourceSheet(store: GlintStore, overlay: Overlay.CustomSourceSheet) {
    val editing = overlay.editId.isNotEmpty()
    val record = remember { Sources.customRecords().firstOrNull { it.id == overlay.editId } }
    var name by remember { mutableStateOf(record?.name ?: "") }
    var base by remember { mutableStateOf(record?.base ?: "") }
    var engine by remember { mutableStateOf(record?.engine ?: "") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val colors = G.colors
    Sheet(store, if (editing) "Edit source" else "Custom source") {
        Field(name, { name = it }, "My Booru", label = "Name")
        Field(base, { base = it }, "https://example.booru.org/", label = "Site URL")
        SectionTitle("Engine")
        Seg(
            listOf("" to "Auto") + Sources.CUSTOM_ENGINES.map { it to it.replaceFirstChar { c -> c.uppercase() } }.take(3),
            engine.takeIf { it in Sources.CUSTOM_ENGINES } ?: "",
        ) { engine = it }
        Seg(
            Sources.CUSTOM_ENGINES.drop(3).map { it to it.replaceFirstChar { c -> c.uppercase() } },
            engine,
        ) { engine = it }
        if (error.isNotEmpty()) Note(error)
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip(if (busy) "Checking…" else if (editing) "Save" else "Add source", on = true) {
                if (busy) return@Chip
                busy = true; error = ""
                store.scope.launch {
                    try {
                        val chosen = engine.ifEmpty { Sources.guessEngine(base) }
                        if (editing) {
                            Sources.updateCustomSource(overlay.editId, name, base, chosen)
                            store.showToast("Source updated")
                        } else {
                            val id = Sources.addCustomSource(name, base, chosen)
                            store.addSourceToRow(id)
                            store.showToast("Source added")
                        }
                        store.pop()
                    } catch (e: Throwable) {
                        error = e.message ?: "Could not add this source."
                    } finally {
                        busy = false
                    }
                }
            }
            if (busy) Spinner(18.dp)
        }
        Note("The engine is probed automatically when set to Auto. Sites must expose a public API of one of the five supported engines.")
        Box(Modifier.padding(bottom = 16.dp))
    }
}

@Composable
fun SourceInfoSheet(store: GlintStore, overlay: Overlay.SourceInfo) {
    val id = overlay.sourceId
    val s = Sources.all[id] ?: run { store.pop(); return }
    var sticky by remember { mutableStateOf(store.state.stags[id] ?: "") }
    val colors = G.colors
    Sheet(store, s.name) {
        if (s.note.isNotEmpty()) Note(s.note)
        SectionTitle("Feed order")
        val orders = listOf("newest" to "Newest") +
            (if (Sources.postPopularitySupported(id)) listOf("popularity" to "Popular") else emptyList())
        Seg(orders, store.feedOrderFor(id)) { store.setFeedOrder(id, it) }
        SectionTitle("Sticky tags")
        Note("Tags appended to every request for this source (e.g. rating filters).")
        Field(sticky, { sticky = it }, s.ratingTag + "safe")
        Row(Modifier.padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Apply", on = true) { store.setStickyTags(id, sticky); store.showToast("Sticky tags saved") }
            Chip("Clear") { sticky = ""; store.setStickyTags(id, "") }
        }
        SectionTitle("Account")
        SheetRow(
            if (Accounts.hasAuth(id)) "Edit source account" else "Connect account",
            trailing = if (Accounts.hasAuth(id)) "Connected" else "↗",
        ) { store.push(Overlay.AccountEdit(id)) }
        if (s.custom) {
            SectionTitle("Custom source")
            SheetRow("Edit name, URL or engine") { store.push(Overlay.CustomSourceSheet(id)) }
        }
        Box(Modifier.padding(bottom = 16.dp))
    }
}

@Composable
fun ConfirmDeleteSheet(store: GlintStore, overlay: Overlay.ConfirmDeleteSource) {
    val s = Sources.all[overlay.sourceId]
    Sheet(store, "Remove source") {
        Note(
            if (s?.custom == true) "Delete " + s.name + "? Its saved account is removed too. Bookmarks from it are kept."
            else "Remove " + (s?.name ?: "this source") + " from your source row? You can re-add it from Manage sources.",
        )
        Row(Modifier.padding(vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Chip("Delete", on = true) {
                store.pop()
                store.removeSourceFromRow(overlay.sourceId)
            }
            Chip("Cancel") { store.pop() }
        }
    }
}

/* ---------------------------------------------------------------- accounts */

@Composable
fun AccountsSheet(store: GlintStore) {
    val colors = G.colors
    Sheet(store, "Source accounts") {
        Note("Sign in with API credentials to see and set real Likes on the source itself. Credentials stay on this device.")
        Sources.order.filter { Sources.all[it]?.off == false && Sources.all[it]?.auth != null }.forEach { id ->
            val s = Sources.source(id)
            val has = Accounts.hasAuth(id)
            SheetRow(
                s.name,
                trailing = if (has) "Connected" else if (Accounts.likesOk(id)) "Likes available" else "Sign in",
            ) { store.push(Overlay.AccountEdit(id)) }
        }
        Box(Modifier.padding(bottom = 16.dp))
    }
}

@Composable
fun AccountEditSheet(store: GlintStore, overlay: Overlay.AccountEdit) {
    val id = overlay.sourceId
    val s = Sources.all[id] ?: run { store.pop(); return }
    val spec = s.auth
    val support = Accounts.sourceSupport(id)
    val existing = Accounts.get(id)
    var login by remember { mutableStateOf(existing.login) }
    var key by remember { mutableStateOf(existing.apiKey) }
    var password by remember { mutableStateOf("") }
    var session by remember { mutableStateOf(existing.session) }
    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("") }
    val colors = G.colors
    Sheet(store, s.name + " account") {
        if (spec == null) {
            Note("This source does not support accounts in this app.")
        } else {
            if (support.steps.isNotEmpty()) {
                SectionTitle("How to connect")
                support.steps.forEach { Note("• $it") }
            }
            if (spec.userLabel.isNotEmpty()) Field(login, { login = it }, spec.userLabel, label = spec.userLabel)
            if (spec.password) {
                Field(password, { password = it }, "Account password", label = "Password", password = true)
                if (existing.passHash.isNotEmpty()) Note("A password hash is already saved. Leave the field empty to keep it.")
            } else if (spec.keyLabel.isNotEmpty()) {
                Field(key, { key = it }, spec.keyLabel, label = spec.keyLabel, password = true)
            }
            if (spec.session) {
                Field(session, { session = it }, "pass_hash cookie value", label = "pass_hash cookie", password = true)
                Note("Needed to set Likes on Gelbooru: copy only the pass_hash cookie value from a signed-in browser.")
            }
            if (support.limits.isNotEmpty()) {
                SectionTitle("Limits")
                support.limits.forEach { Note("• $it") }
            }
            if (status.isNotEmpty()) Note(status)
            Row(Modifier.padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip(if (busy) "Testing…" else "Save & test", on = true) {
                    if (busy) return@Chip
                    busy = true; status = ""
                    store.scope.launch {
                        try {
                            val passHash = when {
                                spec.password && password.isNotEmpty() ->
                                    Accounts.moebooruHash(password, dev.glint.core.urlHost(s.bases[0]))
                                spec.password -> existing.passHash
                                else -> ""
                            }
                            val record = AuthRecord(
                                login = login.trim(),
                                apiKey = key.trim(),
                                passHash = passHash,
                                session = session.trim(),
                                hashVersion = if (spec.password) 2 else 0,
                            )
                            val message = Accounts.testAuth(id, record)
                            Accounts.setAuth(id, record.copy(verifiedAt = Platform.epochMillis()))
                            status = message
                            store.showToast("Account connected")
                        } catch (e: Throwable) {
                            status = e.message ?: "The source rejected these credentials."
                        } finally {
                            busy = false
                        }
                    }
                }
                if (Accounts.hasAuth(id)) {
                    Chip("Sign out") {
                        Accounts.remove(id)
                        login = ""; key = ""; password = ""; session = ""
                        status = "Credentials removed."
                    }
                }
                if (busy) Spinner(18.dp)
            }
            if (support.links.isNotEmpty()) {
                SectionTitle("Helpful pages")
                support.links.forEach { link ->
                    SheetRow(link.label, trailing = "↗") { Platform.openUrl(link.url) }
                }
            }
        }
        Box(Modifier.padding(bottom = 16.dp))
    }
}

/* ---------------------------------------------------------------- advanced */

@Composable
fun AdvancedSheet(store: GlintStore) {
    val colors = G.colors
    var clientId by remember { mutableStateOf(store.state.driveClientId) }
    Sheet(store, "Settings") {
        SheetRow("Image source", trailing = if (store.state.mode == "live") (Sources.all[store.state.src]?.name ?: "") else "Demo artwork") {
            store.push(Overlay.SourcesSheet)
        }
        SheetRow("Source accounts", trailing = Accounts.all().size.let { if (it > 0) "$it saved" else "none" }) {
            store.push(Overlay.AccountsSheet)
        }
        SectionTitle("Appearance")
        Seg(listOf("light" to "Light", "dark" to "Dark", "system" to "System"), store.state.theme) { store.setTheme(it) }
        SectionTitle("Grid columns")
        Seg(listOf("1" to "1", "2" to "2", "3" to "3"), store.state.cols.toString()) { store.setCols(it.toInt()) }
        SectionTitle("Feed image quality")
        Seg(listOf("thumb" to "Thumbnail · fast", "sharp" to "Sharp"), store.state.iqFeed) { store.setImageQuality("feed", it) }
        Note(if (store.state.iqFeed == "thumb") "Small previews: least data, instant scrolling." else "The larger file: sharper tiles, more data.")
        SectionTitle("Post detail quality")
        Seg(listOf("sample" to "Sample", "orig" to "Original"), store.state.iqDetail) { store.setImageQuality("detail", it) }
        Note(if (store.state.iqDetail == "sample") "The site's medium file: sharp enough, faster." else "The untouched upload: best detail, slowest.")
        SectionTitle("Full-screen quality")
        Seg(listOf("sample" to "Sample", "orig" to "Original"), store.state.iqViewer) { store.setImageQuality("viewer", it) }
        SectionTitle("Swipe direction")
        Seg(listOf("left" to "Left → next", "right" to "Right → next"), store.state.sw) { store.setSwipeDirection(it) }
        SectionTitle("Google Drive sync")
        if (!store.drive.available) {
            Note("Google Drive sync is available on Android only. Your bookmarks still export and import as JSON here.")
        } else {
            Note("Your bookmarks, likes metadata and settings in a hidden file in your own Drive. No server of ours is involved.")
            Row(Modifier.padding(vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip(if (store.state.driveOn) "Sync now" else "Connect & sync", on = true) {
                    if (store.state.driveOn) store.drive.syncNow() else store.drive.connect()
                }
                if (store.state.driveOn) Chip("Disconnect") { store.drive.disconnect() }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Auto-sync", size = 14f, modifier = Modifier.weight(1f))
                GlintSwitch(store.state.driveAuto) { store.update { it.copy(driveAuto = !it.driveAuto) } }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Also sync source API keys", size = 14f, modifier = Modifier.weight(1f))
                GlintSwitch(store.state.syncKeys) { store.update { it.copy(syncKeys = !it.syncKeys) } }
            }
            Field(clientId, { clientId = it }, "…apps.googleusercontent.com", label = "OAuth Client ID (Android)")
            Chip("Save client ID") {
                store.update { it.copy(driveClientId = clientId.trim()) }
                store.showToast("Client ID saved")
            }
            Note(store.drive.statusLine())
        }
        SectionTitle("Data")
        SheetRow("Export bookmark backup", trailing = "↓") { store.exportBookmarks() }
        SheetRow("Import bookmarks (merge)", trailing = "↑") { store.importBookmarks() }
        SheetRow("Restore hidden pins (${store.state.hidden.size})", trailing = "") {
            store.update { it.copy(hidden = emptyList()) }
            store.showToast("Hidden pins restored")
        }
        SheetRow("Reset local app data…", danger = true, trailing = "") {
            store.pop()
            store.resetLocalData()
        }
        Note("Bookmarks and settings stay on this device. Backups contain bookmarks and saved post metadata only — never account credentials.")
        Box(Modifier.padding(bottom = 16.dp))
    }
}
