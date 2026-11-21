# Portable UI Layout Audit Pipeline

A zero-dependency, deterministic geometric layout audit toolkit for **React Native / Expo** and **Android Jetpack Compose** (and any other mobile stack that emits `schema.json` snapshots).

It lets AI agents and developers verify spacing, alignment, overflow, safe-area compliance, parent clipping, and touch-target sizes in **one CLI command** with compact JSON output—no emulators or screenshots needed.

## Portable Core Files
Copy the `tools/ui-audit/` directory into any mobile repository:

```
tools/ui-audit/
├── schema.json                        # Platform-agnostic layout snapshot JSON Schema
├── audit.config.json                  # Thresholds, extractorCommand, and intentional allowlist
├── lint_layout.mjs                    # Zero-dependency geometric linter (Node 18+)
├── lint_layout.test.mjs               # Self-tests (`node --test tools/ui-audit/lint_layout.test.mjs`)
├── run                                # Single-command CLI runner (extract -> lint)
└── adapters/
    ├── react-native/                  # Headless Jest + built-in RN Flexbox solver
    └── jetpack-compose/               # Headless Robolectric + Compose Semantics exporter
```

## Quick Commands
```bash
# Full audit (all registered screens x states x profiles)
./tools/ui-audit/run

# Single screen (fast edit loop)
./tools/ui-audit/run --screen today

# Single screen + profile
./tools/ui-audit/run --screen today --profile largest

# Fail on warnings too
./tools/ui-audit/run --strict

# Lint existing snapshots without re-extracting
./tools/ui-audit/run --lint-only

# Verify the linter itself
node --test tools/ui-audit/lint_layout.test.mjs
```

## Reuse in Another React Native / Expo Project
1. Copy `tools/ui-audit/` into the new repo and add `.ui-audit/` to `.gitignore`.
2. Create `src/audit/uiAuditRegistry.tsx` exporting an `AuditScreenDefinition[]` (see TrackItBetter's `src/audit/uiAuditRegistry.tsx`).
3. Create `src/audit/extractSnapshots.audit.tsx` that mocks navigation/safe-area using `auditRuntimeState` and calls `runReactNativeAudit(uiAuditRegistry)`.
4. Ensure `audit.config.json` has `"extractorCommand": "npx jest --silent --runInBand --testMatch \"<rootDir>/src/audit/**/*.audit.tsx\""`.
5. Run `./tools/ui-audit/run`.

## Reuse in a Jetpack Compose Project
See [adapters/jetpack-compose/README.md](adapters/jetpack-compose/README.md) for the 3-step Robolectric JVM setup.
