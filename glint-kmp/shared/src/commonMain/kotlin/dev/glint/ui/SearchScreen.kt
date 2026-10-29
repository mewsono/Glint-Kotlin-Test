package dev.glint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.glint.app.GlintStore
import dev.glint.sources.Sources
import dev.glint.sources.displayName

/** Rounded search input (PWA .search). */
@Composable
fun SearchField(
    value: String,
    placeholder: String,
    onChange: (String) -> Unit,
    onSubmit: (String) -> Unit,
    modifier: Modifier = Modifier,
    onClear: (() -> Unit)? = null,
) {
    val colors = G.colors
    Row(
        modifier
            .clip(RoundedCornerShape(26.dp))
            .background(colors.chip)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        GlintIcon(Glyph.Search, colors.mu, 19.dp, Modifier.press { onSubmit(value) })
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(placeholder, color = colors.mu, size = 15f)
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TextStyle(color = colors.tx, fontSize = 15.sp, fontFamily = G.body),
                cursorBrush = SolidColor(colors.ac),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { onSubmit(value) }),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (value.isNotEmpty() && onClear != null) {
            GlintIcon(Glyph.Close, colors.mu, 16.dp, Modifier.press { onClear() })
        }
    }
}

@Composable
fun SearchScreen(store: GlintStore) {
    val colors = G.colors
    val sourceName = Sources.all[store.state.src]?.name ?: "this source"
    val tokens = store.searchTokens()
    val hasQuery = store.searchQuery.isNotEmpty()

    PinWall(
        store = store,
        pins = store.searchResults,
        cols = store.state.cols,
        header = {
            Column(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                SearchField(
                    value = store.searchDraft,
                    placeholder = "Search tags on $sourceName",
                    onChange = { store.updateSearchDraft(it) },
                    onSubmit = { store.submitSearch(it) },
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp),
                    onClear = { store.submitSearch("") },
                )
                // Tag suggestions while typing.
                if (store.searchSuggestions.isNotEmpty()) {
                    Column(
                        Modifier.fillMaxWidth().padding(horizontal = 10.dp)
                            .clip(RoundedCornerShape(14.dp)).background(colors.sh),
                    ) {
                        store.searchSuggestions.take(8).forEach { sgt ->
                            Row(
                                Modifier.fillMaxWidth().press { store.applySuggestion(sgt.name) }
                                    .padding(horizontal = 14.dp, vertical = 11.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(displayName(sgt.name), size = 14f, weight = FontWeight.Medium, modifier = Modifier.weight(1f))
                                sgt.count?.let { Text(it.toString(), color = colors.mu, size = 12f) }
                            }
                        }
                    }
                }
                // Current query chips (two-tag search etc.) — ✕ removes one tag.
                if (tokens.size > 1) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 10.dp)
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        tokens.forEach { tag ->
                            Row(
                                Modifier.clip(RoundedCornerShape(30.dp)).background(colors.chip)
                                    .padding(start = 12.dp, end = 10.dp, top = 7.dp, bottom = 7.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp),
                            ) {
                                Text(displayName(tag), size = 13f, weight = FontWeight.Medium, maxLines = 1)
                                GlintIcon(Glyph.Close, colors.mu, 13.dp, Modifier.press { store.removeSearchChip(tag) })
                            }
                        }
                    }
                }
                if (hasQuery) {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        val count = store.searchCount
                        Text(
                            when {
                                count != null -> "$count matching pictures"
                                store.searchBusy && store.searchResults.isEmpty() -> "Searching…"
                                else -> "${store.searchResults.size}" + if (store.searchMore) "+ results" else " results"
                            },
                            color = colors.mu, size = 13f, modifier = Modifier.weight(1f),
                        )
                        val orders = listOf("newest") +
                            (if (Sources.postPopularitySupported(store.state.src)) listOf("popularity") else emptyList()) +
                            (if (Sources.postSortSupported(store.state.src)) listOf("oldest") else emptyList())
                        if (orders.size > 1) orders.forEach { order ->
                            Chip(
                                when (order) { "popularity" -> "Popular"; "oldest" -> "Oldest"; else -> "Newest" },
                                on = store.searchOrder == order,
                            ) { store.setSearchOrder(order) }
                        }
                    }
                }
                // Recent searches when the field is idle.
                if (!hasQuery) {
                    val recents = store.recentSearchesFor(store.state.src)
                    if (recents.isNotEmpty()) {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text("Recent searches", color = colors.mu, size = 13f, weight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Text("Clear", color = colors.mu, size = 13f, modifier = Modifier.press { store.clearRecentSearches() })
                            }
                            recents.take(10).forEach { entry ->
                                Row(
                                    Modifier.fillMaxWidth().press { store.searchDraft = entry.query; store.submitSearch(entry.query) }
                                        .padding(vertical = 9.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                                ) {
                                    GlintIcon(Glyph.Search, colors.mu, 15.dp)
                                    Text(entry.query, size = 14f, modifier = Modifier.weight(1f), maxLines = 1)
                                    GlintIcon(Glyph.Close, colors.mu, 14.dp, Modifier.press { store.removeRecentSearch(entry.query) })
                                }
                            }
                        }
                    }
                }
                if (store.searchError.isNotEmpty()) {
                    FeedError(store.searchError) { store.runSearch(reset = store.searchResults.isEmpty()) }
                }
            }
        },
        footer = {
            Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                when {
                    store.searchBusy -> Spinner()
                    hasQuery && store.searchResults.isEmpty() && store.searchError.isEmpty() && store.searchPage > 0 ->
                        Empty("No posts match this search.")
                    hasQuery && store.searchMore && store.searchResults.isNotEmpty() ->
                        RetrySpinButton("More") { store.searchMoreResults() }
                    else -> {}
                }
            }
        },
        onEndReached = { if (hasQuery && store.searchError.isEmpty()) store.searchMoreResults() },
    )
}
