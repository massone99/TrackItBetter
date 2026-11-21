package com.uiaudit

import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsNode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.unit.Density
import java.io.File
import java.util.Locale

data class AuditSafeArea(
    val top: Float,
    val bottom: Float,
    val left: Float = 0f,
    val right: Float = 0f,
)

data class AuditViewport(
    val width: Float,
    val height: Float,
    val fontScale: Float,
    val safeArea: AuditSafeArea,
)

data class AuditProfile(
    val name: String,
    val viewport: AuditViewport,
)

val DEFAULT_AUDIT_PROFILES = listOf(
    AuditProfile(
        name = "compact",
        viewport = AuditViewport(360f, 800f, 1.0f, AuditSafeArea(top = 24f, bottom = 24f)),
    ),
    AuditProfile(
        name = "standard",
        viewport = AuditViewport(390f, 844f, 1.0f, AuditSafeArea(top = 44f, bottom = 34f)),
    ),
    AuditProfile(
        name = "a11y_large_text",
        viewport = AuditViewport(360f, 800f, 1.3f, AuditSafeArea(top = 24f, bottom = 24f)),
    ),
)

/**
 * Zero-dependency Kotlin exporter that converts a Jetpack Compose [SemanticsNode]
 * tree into the standardized `tools/ui-audit/schema.json` format.
 *
 * Works headlessly on the JVM via Robolectric + `createComposeRule()`.
 */
object UiAuditSnapshotExporter {

    fun export(
        rootNode: SemanticsNode,
        density: Density,
        screen: String,
        state: String,
        profile: AuditProfile,
        outputDir: File = File(".ui-audit/snapshots"),
    ): File {
        outputDir.mkdirs()
        val nodesJson = mutableListOf<String>()
        walk(
            node = rootNode,
            parentId = null,
            density = density,
            zLayer = 0,
            out = nodesJson,
        )

        val vp = profile.viewport
        val json = buildString {
            append("{")
            append("\"screen\":${q(screen)},")
            append("\"state\":${q(state)},")
            append("\"profile\":${q(profile.name)},")
            append("\"viewport\":{")
            append("\"width\":${fmt(vp.width)},")
            append("\"height\":${fmt(vp.height)},")
            append("\"fontScale\":${fmt(vp.fontScale)},")
            append("\"safeArea\":{")
            append("\"top\":${fmt(vp.safeArea.top)},")
            append("\"bottom\":${fmt(vp.safeArea.bottom)},")
            append("\"left\":${fmt(vp.safeArea.left)},")
            append("\"right\":${fmt(vp.safeArea.right)}")
            append("}},")
            append("\"nodes\":[")
            append(nodesJson.joinToString(","))
            append("]}")
        }

        val outFile = File(outputDir, "${screen}__${state}__${profile.name}.json")
        outFile.writeText(json)
        return outFile
    }

    private fun walk(
        node: SemanticsNode,
        parentId: String?,
        density: Density,
        zLayer: Int,
        out: MutableList<String>,
    ) {
        val cfg = node.config
        val id = "n_${node.id}"
        val testTag = cfg.getOrNull(SemanticsProperties.TestTag)
        val textList = cfg.getOrNull(SemanticsProperties.Text)
        val editableText = cfg.getOrNull(SemanticsProperties.EditableText)
        val text = (textList?.joinToString("\n") { it.text } ?: editableText?.text)?.takeIf { it.isNotEmpty() }

        val hasClick = cfg.getOrNull(SemanticsActions.OnClick) != null
        val hasSetText = cfg.getOrNull(SemanticsActions.SetText) != null
        val vScroll = cfg.getOrNull(SemanticsProperties.VerticalScrollAxisRange) != null
        val hScroll = cfg.getOrNull(SemanticsProperties.HorizontalScrollAxisRange) != null
        val scrollable = vScroll || hScroll
        val scrollAxis = when {
            vScroll && hScroll -> "both"
            hScroll -> "horizontal"
            vScroll -> "vertical"
            else -> null
        }

        val composeRole = cfg.getOrNull(SemanticsProperties.Role)
        val interactive = hasClick || hasSetText ||
            composeRole == Role.Button ||
            composeRole == Role.Checkbox ||
            composeRole == Role.Switch ||
            composeRole == Role.RadioButton ||
            composeRole == Role.Tab

        val role = when {
            hasSetText -> "input"
            scrollable -> "scroll_container"
            composeRole == Role.Image -> "image"
            interactive -> "button"
            text != null -> "text"
            cfg.getOrNull(SemanticsProperties.IsDialog) != null ||
                cfg.getOrNull(SemanticsProperties.IsPopup) != null -> "overlay"
            else -> "container"
        }

        val nextZ = if (role == "overlay") zLayer + 100 else zLayer
        val rectPx = node.boundsInRoot
        val x = rectPx.left / density.density
        val y = rectPx.top / density.density
        val w = rectPx.width / density.density
        val h = rectPx.height / density.density
        val visible = cfg.getOrNull(SemanticsProperties.InvisibleToUser) == null

        out.add(
            buildString {
                append("{")
                append("\"id\":${q(id)},")
                append("\"testId\":${testTag?.let(::q) ?: "null"},")
                append("\"parentId\":${parentId?.let(::q) ?: "null"},")
                append("\"role\":${q(role)},")
                append("\"text\":${text?.let(::q) ?: "null"},")
                append("\"bounds\":{\"x\":${fmt(x)},\"y\":${fmt(y)},\"width\":${fmt(w)},\"height\":${fmt(h)}},")
                append("\"interactive\":$interactive,")
                append("\"visible\":$visible,")
                append("\"scrollable\":$scrollable,")
                if (scrollAxis != null) append("\"scrollAxis\":${q(scrollAxis)},")
                append("\"clipped\":false,")
                append("\"textTruncated\":false,")
                append("\"zLayer\":$nextZ")
                append("}")
            }
        )

        for (child in node.children) {
            walk(child, id, density, nextZ, out)
        }
    }

    private fun fmt(v: Float): String = String.format(Locale.US, "%.1f", v)

    private fun q(s: String): String {
        val escaped = s
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
        return "\"$escaped\""
    }
}
