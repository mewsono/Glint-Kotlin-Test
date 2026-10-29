package dev.glint.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The single home of every JSON convenience helper used across the code base.
 * All helpers are public, null-safe (nullable receivers) and total (never throw).
 * Import with `import dev.glint.core.*`.
 */

val LenientJson: Json = Json {
    ignoreUnknownKeys = true
    isLenient = true
    encodeDefaults = true
    coerceInputValues = true
}

fun parseJsonOrNull(text: String): JsonElement? = try {
    LenientJson.parseToJsonElement(text)
} catch (_: Throwable) {
    null
}

/* ------------------------------------------------ element casts */

val JsonElement?.objOrNull: JsonObject? get() = this as? JsonObject
val JsonElement?.arrOrNull: JsonArray? get() = this as? JsonArray

/** Value at [key], with JsonNull collapsed to null. */
fun JsonObject?.el(key: String): JsonElement? = this?.get(key)?.takeIf { e: JsonElement -> e !is JsonNull }

/* ------------------------------------------------ element scalars */

fun JsonElement?.asStringOr(default: String = ""): String = when (this) {
    is JsonPrimitive -> content
    else -> default
}

fun JsonElement?.asIntOr(default: Int = 0): Int = when (this) {
    is JsonPrimitive -> content.toDoubleOrNull()?.toInt() ?: default
    else -> default
}

fun JsonElement?.asLongOr(default: Long = 0L): Long = when (this) {
    is JsonPrimitive -> content.toDoubleOrNull()?.toLong() ?: default
    else -> default
}

fun JsonElement?.asDoubleOr(default: Double = 0.0): Double = when (this) {
    is JsonPrimitive -> content.toDoubleOrNull() ?: default
    else -> default
}

fun JsonElement?.asDoubleOrNull(): Double? = (this as? JsonPrimitive)?.content?.toDoubleOrNull()

fun JsonElement?.asBoolOr(default: Boolean = false): Boolean = asBoolOrNull() ?: default

fun JsonElement?.asBoolOrNull(): Boolean? = when (this) {
    is JsonPrimitive -> when (content) {
        "true", "1" -> true
        "false", "0" -> false
        else -> null
    }
    else -> null
}

/* ------------------------------------------------ keyed object accessors */

fun JsonObject?.str(key: String, default: String = ""): String = el(key).asStringOr(default)
fun JsonObject?.int(key: String, default: Int = 0): Int = el(key).asIntOr(default)
fun JsonObject?.long(key: String, default: Long = 0L): Long = el(key).asLongOr(default)
fun JsonObject?.double(key: String, default: Double = 0.0): Double = el(key).asDoubleOr(default)
fun JsonObject?.bool(key: String, default: Boolean = false): Boolean = el(key).asBoolOr(default)
fun JsonObject?.obj(key: String): JsonObject? = el(key).objOrNull
fun JsonObject?.arr(key: String): JsonArray? = el(key).arrOrNull
