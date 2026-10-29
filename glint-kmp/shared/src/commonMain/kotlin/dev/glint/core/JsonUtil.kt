package dev.glint.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

val LenientJson = Json {
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

val JsonElement?.objOrNull: JsonObject? get() = this as? JsonObject
val JsonElement?.arrOrNull: JsonArray? get() = this as? JsonArray

fun JsonObject.el(key: String): JsonElement? = this[key]?.takeIf { it !is JsonNull }

fun JsonElement?.asStringOr(default: String = ""): String = when (this) {
    is JsonPrimitive -> if (isString) content else content
    null, is JsonNull -> default
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

fun JsonElement?.asDoubleOrNull(): Double? = (this as? JsonPrimitive)?.content?.toDoubleOrNull()

fun JsonElement?.asBoolOrNull(): Boolean? = when (this) {
    is JsonPrimitive -> when (content) {
        "true" -> true
        "false" -> false
        else -> null
    }
    else -> null
}

fun JsonObject.str(key: String, default: String = ""): String = el(key).asStringOr(default)
fun JsonObject.int(key: String, default: Int = 0): Int = el(key).asIntOr(default)
fun JsonObject.long(key: String, default: Long = 0L): Long = el(key).asLongOr(default)
fun JsonObject.obj(key: String): JsonObject? = el(key)?.objOrNull
fun JsonObject.arr(key: String): JsonArray? = el(key)?.arrOrNull
