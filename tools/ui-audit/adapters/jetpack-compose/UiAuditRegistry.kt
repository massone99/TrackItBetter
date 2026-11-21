package com.uiaudit

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import java.io.File

data class ComposeAuditScreen(
    val id: String,
    val states: Map<String, @Composable () -> Unit>,
)

/**
 * Reusable Compose headless audit runner.
 *
 * Call from a Robolectric JVM test (`@RunWith(RobolectricTestRunner::class)`) so
 * every screen × state × profile runs in seconds without an Android emulator.
 */
object UiAuditComposeRunner {
    fun run(
        composeRule: ComposeContentTestRule,
        registry: List<ComposeAuditScreen>,
        profiles: List<AuditProfile> = DEFAULT_AUDIT_PROFILES,
        outputDir: File = File(System.getenv("UI_AUDIT_OUT_DIR") ?: ".ui-audit/snapshots"),
    ) {
        val screenFilter = System.getenv("UI_AUDIT_SCREEN")?.takeIf { it.isNotBlank() }
        val stateFilter = System.getenv("UI_AUDIT_STATE")?.takeIf { it.isNotBlank() }
        val profileFilter = System.getenv("UI_AUDIT_PROFILE")?.takeIf { it.isNotBlank() }

        for (screen in registry) {
            if (screenFilter != null && screen.id != screenFilter) continue
            for ((stateName, content) in screen.states) {
                if (stateFilter != null && stateName != stateFilter) continue
                for (profile in profiles) {
                    if (profileFilter != null && profile.name != profileFilter) continue

                    val auditDensity = Density(density = 1f, fontScale = profile.viewport.fontScale)
                    composeRule.setContent {
                        CompositionLocalProvider(LocalDensity provides auditDensity) {
                            Box(
                                modifier = Modifier.size(
                                    width = profile.viewport.width.dp,
                                    height = profile.viewport.height.dp,
                                )
                            ) {
                                content()
                            }
                        }
                    }
                    composeRule.waitForIdle()

                    val root = composeRule.onRoot(useUnmergedTree = true).fetchSemanticsNode()
                    UiAuditSnapshotExporter.export(
                        rootNode = root,
                        density = auditDensity,
                        screen = screen.id,
                        state = stateName,
                        profile = profile,
                        outputDir = outputDir,
                    )
                }
            }
        }
    }
}
