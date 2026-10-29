package dev.glint.android

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.addCallback
import dev.glint.app.GlintStore
import dev.glint.core.*
import dev.glint.ui.GlintApp
import java.io.BufferedReader

class MainActivity : ComponentActivity() {

    private var store: GlintStore? = null

    private var pendingSave: Pair<String, String>? = null // mime to content
    private var pendingOpen: ((String?) -> Unit)? = null
    private var pendingOpenLimit: Long = Long.MAX_VALUE

    private val createDocument = registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri: Uri? ->
        val payload = pendingSave
        pendingSave = null
        if (uri != null && payload != null) {
            try {
                contentResolver.openOutputStream(uri)?.use { it.write(payload.second.toByteArray()) }
            } catch (_: Throwable) {}
        }
    }

    private val openDocument = registerForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        val callback = pendingOpen
        pendingOpen = null
        if (uri == null || callback == null) { callback?.invoke(null); return@registerForActivityResult }
        try {
            val size = contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L
            if (size > pendingOpenLimit) { callback(null); return@registerForActivityResult }
            val text = contentResolver.openInputStream(uri)
                ?.bufferedReader()
                ?.use(BufferedReader::readText)
            callback(text)
        } catch (_: Throwable) {
            callback(null)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AndroidBridge.appContext = applicationContext
        AndroidBridge.activity = this
        AndroidBridge.createDocument = { filename, mime, content ->
            pendingSave = mime to content
            createDocument.launch(filename)
        }
        AndroidBridge.openDocument = { _, maxBytes, onResult ->
            pendingOpen = onResult
            pendingOpenLimit = maxBytes
            openDocument.launch(arrayOf("application/json", "text/plain", "*/*"))
        }
        handleOAuth(intent)
        // System back pops Glint's overlay stack before leaving the app.
        onBackPressedDispatcher.addCallback(this) {
            if (store?.goBack() != true) {
                isEnabled = false
                onBackPressedDispatcher.onBackPressed()
                isEnabled = true
            }
        }
        setContent {
            GlintApp(storeFactory = { scope -> GlintStore(scope).also { store = it } })
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleOAuth(intent)
    }

    private fun handleOAuth(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "dev.glint") {
            AndroidBridge.onOAuthRedirect?.invoke(data)
        }
    }

    override fun onDestroy() {
        if (AndroidBridge.activity === this) AndroidBridge.activity = null
        super.onDestroy()
    }
}
