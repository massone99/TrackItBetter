import type React from 'react';

export type AuditNodeRole =
  | 'text'
  | 'button'
  | 'input'
  | 'image'
  | 'container'
  | 'scroll_container'
  | 'icon'
  | 'overlay'
  | 'other';

export interface AuditSafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface AuditViewport {
  width: number;
  height: number;
  fontScale: number;
  safeArea: AuditSafeArea;
}

export interface AuditBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AuditHitSlop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface AuditNode {
  id: string;
  testId: string | null;
  /** accessibilityLabel, to name nodes without a testID in the report. */
  label?: string | null;
  parentId: string | null;
  role: AuditNodeRole;
  text: string | null;
  bounds: AuditBounds;
  interactive: boolean;
  visible: boolean;
  scrollable: boolean;
  scrollAxis?: 'vertical' | 'horizontal' | 'both' | null;
  hitSlop?: AuditHitSlop | null;
  clipped: boolean;
  textTruncated: boolean;
  /** 'word': a single word is wider than its line (clipped or broken mid-word). */
  textOverflow?: 'word' | null;
  zLayer: number;
}

export interface AuditSnapshot {
  screen: string;
  state: string;
  profile?: string;
  viewport: AuditViewport;
  nodes: AuditNode[];
}

export interface RenderProfile {
  name: string;
  viewport: AuditViewport;
  /** Key-value preferences (interface size, theme...) the app reads before rendering. */
  preferences?: Record<string, string>;
}

/**
 * TrackItBetter's three check sizes (CLAUDE.md, "UI checks on every change") on a Galaxy S26 window
 * (360 x 780 dp): smallest = interface 70 %, text 100 %; standard = 100 %; largest = interface 130 %,
 * system text 200 %. `preferences` are fed to the mocked `readPreference` before each render.
 */
export const DEFAULT_RENDER_PROFILES: RenderProfile[] = [
  {
    name: 'smallest',
    viewport: { width: 360, height: 780, fontScale: 1.0, safeArea: { top: 24, bottom: 24, left: 0, right: 0 } },
    preferences: { 'appearance.scale': '0.7' },
  },
  {
    name: 'standard',
    viewport: { width: 360, height: 780, fontScale: 1.0, safeArea: { top: 24, bottom: 24, left: 0, right: 0 } },
    preferences: { 'appearance.scale': '1' },
  },
  {
    name: 'largest',
    viewport: { width: 360, height: 780, fontScale: 2.0, safeArea: { top: 24, bottom: 24, left: 0, right: 0 } },
    preferences: { 'appearance.scale': '1.3' },
  },
];

export type AuditScreenStateName = 'default' | 'empty' | 'long_text' | 'error' | (string & {});

export interface AuditScreenStateFixture {
  /** Optional setup hook to populate stores, mocks, or route params before rendering. */
  setup?: () => void | Promise<void>;
  /** Optional teardown hook run after snapshot extraction. */
  teardown?: () => void | Promise<void>;
  /** Optional route params injected into mocked useRoute() for this state. */
  routeParams?: Record<string, unknown>;
  /** Optional wait after render until the screen shows its data (e.g. `findByText`). */
  ready?: (screen: typeof import('@testing-library/react-native').screen) => Promise<unknown>;
  /** Extra preferences for this state, merged over the profile's. */
  preferences?: Record<string, string>;
  /** Element factory (overrides screen-level render when provided). */
  render?: () => React.ReactElement;
}

export interface AuditScreenDefinition {
  /** Unique screen id (used in CLI `--screen <id>` and snapshot filenames). */
  id: string;
  /** Default element factory for this screen. */
  render: () => React.ReactElement;
  /** Named states to audit (e.g. default, empty, long_text, error). */
  states: Record<AuditScreenStateName, AuditScreenStateFixture>;
}
