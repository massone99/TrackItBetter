# Jetpack Compose Adapter (Headless JVM via Robolectric)

Drop `tools/ui-audit/` into any Android Jetpack Compose project and wire up headless layout auditing in 3 steps:

## 1. Add Test Dependencies (`app/build.gradle.kts`)
```kotlin
testImplementation("org.robolectric:robolectric:4.13")
testImplementation("androidx.compose.ui:ui-test-junit4")
debugImplementation("androidx.compose.ui:ui-test-manifest")
```
Enable Robolectric resources in `android { testOptions { unitTests.isIncludeAndroidResources = true } }`.

## 2. Copy the Two Kotlin Files into `app/src/test/java/com/uiaudit/`
- `UiAuditSnapshotExporter.kt`
- `UiAuditRegistry.kt`

Then add your screen registry test (`app/src/test/java/com/uiaudit/UiAuditExtractorTest.kt`):
```kotlin
package com.uiaudit

import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class UiAuditExtractorTest {
    @get:Rule val composeRule = createComposeRule()

    private val registry = listOf(
        ComposeAuditScreen(
            id = "checkout",
            states = mapOf(
                "default" to { CheckoutScreen(uiState = CheckoutFixtures.default) },
                "empty" to { CheckoutScreen(uiState = CheckoutFixtures.empty) },
                "long_text" to { CheckoutScreen(uiState = CheckoutFixtures.longText) },
            ),
        ),
    )

    @Test
    fun extractAllSnapshots() {
        UiAuditComposeRunner.run(composeRule, registry)
    }
}
```

## 3. Configure `tools/ui-audit/audit.config.json`
```json
{
  "gridUnit": 4,
  "minTouchTarget": 48,
  "nearMissRangePx": [1, 6],
  "extractorCommand": "./gradlew :app:testDebugUnitTest --tests com.uiaudit.UiAuditExtractorTest --quiet",
  "ignore": []
}
```

Now run:
```bash
./tools/ui-audit/run
./tools/ui-audit/run --screen checkout --profile a11y_large_text
```
