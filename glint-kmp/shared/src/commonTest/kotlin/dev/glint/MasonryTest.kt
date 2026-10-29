package dev.glint

import dev.glint.model.Pin
import dev.glint.ui.masonryColumns
import dev.glint.ui.pinRatio
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** Port of tests/masonry.test.cjs: ratios stay finite, columns stay balanced. */
class MasonryTest {

    private fun pins(ratios: List<Double>): List<Pin> =
        ratios.mapIndexed { i, r -> Pin(id = i.toString(), r = r) }

    @Test
    fun ratioFromExplicitValue() {
        assertEquals(1.25f, pinRatio(Pin(id = "a", r = 1.25)))
    }

    @Test
    fun ratioFallsBackToDimensions() {
        // r <= 0 means "unknown": height/width decides, like masonryRatio.
        assertEquals(1.5f, pinRatio(Pin(id = "a", r = 0.0, width = 400, height = 600)))
        assertEquals(2f / 3f, pinRatio(Pin(id = "a", r = 0.0, width = 600, height = 400)), 1e-6f)
    }

    @Test
    fun ratioDefaultsWithoutAnyData() {
        assertEquals(4f / 3f, pinRatio(Pin(id = "a", r = 0.0)), 1e-6f)
    }

    @Test
    fun ratioIsClamped() {
        assertEquals(20f, pinRatio(Pin(id = "a", r = 999.0)))
        assertEquals(0.05f, pinRatio(Pin(id = "a", r = 0.0001)))
        assertTrue(pinRatio(Pin(id = "a", r = Double.POSITIVE_INFINITY)) <= 20f)
    }

    @Test
    fun twoColumnsStayBalanced() {
        for (ratios in listOf(
            List(6) { 1.3 },
            List(6) { 4.0 / 3.0 },
            listOf(.68, 1.3, 1.5, .85, 1.25, 1.1),
        )) {
            val columns = masonryColumns(pins(ratios), 2) { pinRatio(it) }
            assertEquals(6, columns.sumOf { it.size })
            assertTrue(columns.all { it.size >= 2 }, columns.map { it.size }.toString())
        }
    }

    @Test
    fun threeColumnsSplitEvenly() {
        val columns = masonryColumns(pins(List(6) { 1.0 }), 3) { pinRatio(it) }
        assertEquals(listOf(2, 2, 2), columns.map { it.size })
    }

    @Test
    fun invalidColumnCountIsClamped() {
        val columns = masonryColumns(pins(List(6) { 1.0 }), 0) { pinRatio(it) }
        assertEquals(1, columns.size)
        assertEquals(6, columns[0].size)
    }

    @Test
    fun placementUsesShortestColumn() {
        // A tall first tile pushes the following short tiles to the other column.
        val columns = masonryColumns(pins(listOf(3.0, 0.5, 0.5, 0.5)), 2) { pinRatio(it) }
        assertEquals(1, columns[0].size)
        assertEquals(3, columns[1].size)
    }
}
