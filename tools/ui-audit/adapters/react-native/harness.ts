import { Dimensions } from 'react-native';
import { act, render, cleanup, screen } from '@testing-library/react-native';
import { extractSnapshotFromRNTree, type LayoutCallback, type RNJsonNode } from './flexLayout';
import {
  DEFAULT_RENDER_PROFILES,
  type AuditScreenDefinition,
  type AuditViewport,
  type RenderProfile,
} from './types';

// Node built-ins through Jest, typed locally: the app's tsconfig does not load @types/node.
const fs: {
  mkdirSync(dir: string, options: { recursive: boolean }): void;
  readdirSync(dir: string): string[];
  unlinkSync(file: string): void;
  writeFileSync(file: string, data: string, encoding: 'utf8'): void;
} = jest.requireActual('node:fs');
const path: { resolve(...parts: string[]): string; join(...parts: string[]): string } = jest.requireActual('node:path');

/**
 * Shared mutable context read by mocked `react-native-safe-area-context` and
 * `@react-navigation/native` in the Jest audit test file.
 */
export const auditRuntimeState: {
  viewport: AuditViewport;
  routeParams: Record<string, unknown>;
  preferences: Map<string, string>;
} = {
  viewport: DEFAULT_RENDER_PROFILES[1].viewport,
  routeParams: {},
  preferences: new Map(),
};

/** Lets pending promises (database loads in effects) resolve and re-render. */
async function settle(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
}

export interface RenderError {
  screen: string;
  state: string;
  profile: string;
  error: string;
}

export interface RunReactNativeAuditOptions {
  profiles?: RenderProfile[];
  outDir?: string;
  screenFilter?: string;
  stateFilter?: string;
  profileFilter?: string;
  /** Optional reset hook run before each screen+state+profile render. */
  resetBetweenRuns?: () => void | Promise<void>;
}

/**
 * Renders every matching (screen × state × profile) combination in-process,
 * computes real Flexbox layout boxes, and writes standardized JSON snapshots.
 */
export async function runReactNativeAudit(
  registry: AuditScreenDefinition[],
  options: RunReactNativeAuditOptions = {}
): Promise<{ written: string[]; errors: RenderError[] }> {
  const profiles = options.profiles ?? DEFAULT_RENDER_PROFILES;
  const outDir = path.resolve(
    process.cwd(),
    options.outDir ?? process.env.UI_AUDIT_OUT_DIR ?? '.ui-audit/snapshots'
  );
  const screenFilter = options.screenFilter ?? process.env.UI_AUDIT_SCREEN ?? '';
  const stateFilter = options.stateFilter ?? process.env.UI_AUDIT_STATE ?? '';
  const profileFilter = options.profileFilter ?? process.env.UI_AUDIT_PROFILE ?? '';

  fs.mkdirSync(outDir, { recursive: true });

  // Clear stale snapshots for the selected scope so removed screens don't linger
  if (!screenFilter && !stateFilter && !profileFilter) {
    for (const file of fs.readdirSync(outDir)) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(outDir, file));
      }
    }
  }

  const written: string[] = [];
  const errors: RenderError[] = [];

  for (const screenDef of registry) {
    if (screenFilter && screenDef.id !== screenFilter) continue;

    for (const [stateName, fixture] of Object.entries(screenDef.states)) {
      if (stateFilter && stateName !== stateFilter) continue;

      for (const profile of profiles) {
        if (profileFilter && profile.name !== profileFilter) continue;

        if (options.resetBetweenRuns) {
          await options.resetBetweenRuns();
        }

        auditRuntimeState.viewport = profile.viewport;
        auditRuntimeState.routeParams = fixture.routeParams ?? {};
        auditRuntimeState.preferences = new Map(Object.entries({ ...profile.preferences, ...fixture.preferences }));
        (globalThis as { __fontScale?: number }).__fontScale = profile.viewport.fontScale;

        Dimensions.set({
          window: {
            width: profile.viewport.width,
            height: profile.viewport.height,
            scale: 2,
            fontScale: profile.viewport.fontScale,
          },
          screen: {
            width: profile.viewport.width,
            height: profile.viewport.height,
            scale: 2,
            fontScale: profile.viewport.fontScale,
          },
        });

        // One screen that fails to render is reported, and the others still run.
        try {
          if (fixture.setup) {
            await fixture.setup();
          }

          const element = fixture.render ? fixture.render() : screenDef.render();
          const rendered = await render(element);
          await settle();
          if (fixture.ready) await fixture.ready(screen);
          await settle(2);
          const meta = { screen: screenDef.id, state: stateName, profile: profile.name, viewport: profile.viewport };
          // Views that size their content from onLayout (charts, sparklines) never get it in Jest: solve
          // once, replay onLayout with the solved boxes, and solve again with what they drew.
          const callbacks: LayoutCallback[] = [];
          extractSnapshotFromRNTree(rendered.toJSON() as RNJsonNode | RNJsonNode[] | null, meta, callbacks);
          if (callbacks.length > 0) {
            await act(async () => {
              for (const { onLayout, layout } of callbacks) onLayout({ nativeEvent: { layout } });
            });
            await settle(2);
          }
          const tree = rendered.toJSON() as RNJsonNode | RNJsonNode[] | null;
          const snapshot = extractSnapshotFromRNTree(tree, meta);

          const filename = `${screenDef.id}__${stateName}__${profile.name}.json`;
          const outPath = path.join(outDir, filename);
          fs.writeFileSync(outPath, JSON.stringify(snapshot), 'utf8');
          // UI_AUDIT_DUMP=1 also keeps the rendered tree (props and styles), to debug the solver.
          if (process.env.UI_AUDIT_DUMP) fs.writeFileSync(outPath.replace(/\.json$/, '.tree'), JSON.stringify(tree), 'utf8');
          written.push(outPath);

          cleanup();
        } catch (error) {
          const message = error instanceof Error ? `${error.message}\n${(error.stack ?? '').split('\n').slice(1, 6).join('\n')}` : String(error);
          errors.push({ screen: screenDef.id, state: stateName, profile: profile.name, error: message.slice(0, 1200) });
          cleanup();
        }

        if (fixture.teardown) {
          await fixture.teardown();
        }
      }
    }
  }

  fs.writeFileSync(path.join(outDir, '..', 'render-errors.json'), JSON.stringify(errors), 'utf8');
  return { written, errors };
}
