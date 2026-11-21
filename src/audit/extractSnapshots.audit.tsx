/**
 * UI layout audit: renders every screen of `uiAuditRegistry` at the three check sizes, solves the
 * Flexbox layout in-process and writes `.ui-audit/snapshots/*.json` for `tools/ui-audit/lint_layout.mjs`.
 * Not part of `npm test`: run it with `npm run ui:audit` (Node 22, `node:sqlite`).
 */
import { runReactNativeAudit } from '../../tools/ui-audit/adapters/react-native/harness';
import { uiAuditRegistry } from './uiAuditRegistry';

jest.mock('../db/client', () => {
  const { createRealDatabase } = jest.requireActual('../test/realDatabase');
  const real = createRealDatabase();
  return { db: real.db, initializeDatabase: jest.fn(async () => undefined), mockReal: real };
});
jest.mock('expo-crypto', () => ({
  ...jest.requireActual('expo-crypto'),
  randomUUID: jest.requireActual('node:crypto').randomUUID,
}));
jest.mock('../shared/settings/preferences', () => {
  const harness = () => jest.requireActual('../../tools/ui-audit/adapters/react-native/harness').auditRuntimeState;
  return {
    ...jest.requireActual('../shared/settings/preferences'),
    readPreference: (key: string) => harness().preferences.get(key) ?? null,
    writePreference: (key: string, value: string) => { harness().preferences.set(key, value); },
    readBooleanPreference: (key: string, fallback: boolean) => {
      const value = harness().preferences.get(key);
      return value === undefined ? fallback : value === 'true';
    },
  };
});
jest.mock('../features/pose/detectPose', () => ({ poseDetectionAvailable: true, detectPose: jest.fn() }));
// Native modules without a JS fallback: drawn as plain views, so the layout around them is still audited.
jest.mock('expo-video', () => {
  const { View } = jest.requireActual('react-native');
  const player = { play: jest.fn(), pause: jest.fn(), replace: jest.fn(), addListener: () => ({ remove: () => undefined }), release: jest.fn(), currentTime: 0, duration: 0, playing: false, loop: false, muted: false };
  return { VideoView: View, useVideoPlayer: () => player, createVideoPlayer: () => player };
});
jest.mock('expo-audio', () => {
  const player = { play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), remove: jest.fn(), replace: jest.fn(), addListener: () => ({ remove: () => undefined }), volume: 1 };
  return { createAudioPlayer: () => player, useAudioPlayer: () => player, setAudioModeAsync: jest.fn(async () => undefined) };
});
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => undefined), isSpeakingAsync: jest.fn(async () => false), getAvailableVoicesAsync: jest.fn(async () => []) }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///shot.png') }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg', PNG: 'png' } }));
jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: jest.fn() }));
jest.mock('@shopify/react-native-skia', () => {
  const { View } = jest.requireActual('react-native');
  const node = () => null;
  return { Canvas: View, Image: node, Circle: node, Group: node, Line: node, Path: node, useImage: () => null, vec: (x: number, y: number) => ({ x, y }), Skia: { Path: { Make: () => ({ moveTo: jest.fn(), lineTo: jest.fn(), close: jest.fn() }) } }, AlphaType: {}, ColorType: {} };
});
jest.mock('expo-keep-awake', () => ({ useKeepAwake: () => undefined, activateKeepAwakeAsync: jest.fn(), deactivateKeepAwake: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('react-native-reanimated', () => {
  const { View, Text, ScrollView } = jest.requireActual('react-native');
  const chain: object = new Proxy(() => chain, { get: () => () => chain });
  const base: Record<string | symbol, unknown> = {
    __esModule: true,
    default: { View, Text, ScrollView, createAnimatedComponent: (component: unknown) => component },
    View, Text, ScrollView,
    createAnimatedComponent: (component: unknown) => component,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (factory: () => object) => factory(),
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    useAnimatedReaction: () => undefined,
    useReducedMotion: () => true,
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withDelay: (_delay: number, value: unknown) => value,
    withSequence: (...values: unknown[]) => values[values.length - 1],
    withRepeat: (value: unknown) => value,
    cancelAnimation: () => undefined,
    runOnJS: (fn: unknown) => fn,
    interpolate: () => 0,
    Easing: chain,
  };
  // Layout animations (FadeInDown, FadeOutLeft, LinearTransition...): any other export is a no-op builder.
  return new Proxy(base, { get: (target, key) => (key in target ? target[key] : chain) });
});
jest.mock('react-native-gesture-handler', () => {
  const chain: object = new Proxy(() => chain, { get: () => () => chain });
  const { View, ScrollView } = jest.requireActual('react-native');
  return {
    Gesture: { Pan: () => chain, Tap: () => chain, LongPress: () => chain, Simultaneous: () => chain, Race: () => chain, Exclusive: () => chain },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: View,
    ScrollView,
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const harness = () => jest.requireActual('../../tools/ui-audit/adapters/react-native/harness').auditRuntimeState;
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismiss: jest.fn(), canGoBack: () => true, setParams: jest.fn() },
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
    useLocalSearchParams: () => harness().routeParams,
    useGlobalSearchParams: () => harness().routeParams,
    useSegments: () => ['(tabs)'],
    usePathname: () => '/',
    useNavigation: () => ({ setOptions: jest.fn(), addListener: () => () => undefined, dispatch: jest.fn(), getState: () => ({ routes: [] }) }),
    useFocusEffect: (callback: () => void) => React.useEffect(callback, [callback]),
    Link: ({ children }: { children: unknown }) => children,
    Stack: Object.assign(() => null, { Screen: () => null }),
    Tabs: Object.assign(() => null, { Screen: () => null }),
    Redirect: () => null,
  };
});
jest.mock('react-native-safe-area-context', () => {
  const ReactLib = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const insets = () => jest.requireActual('../../tools/ui-audit/adapters/react-native/harness').auditRuntimeState.viewport.safeArea;
  return {
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    SafeAreaView: ({ children, style, edges, ...rest }: { children: unknown; style: unknown; edges?: string[] }) => {
      const sa = insets();
      const active = new Set(edges ?? ['top', 'bottom', 'left', 'right']);
      const pad = { paddingTop: active.has('top') ? sa.top : 0, paddingBottom: active.has('bottom') ? sa.bottom : 0, paddingLeft: active.has('left') ? sa.left : 0, paddingRight: active.has('right') ? sa.right : 0 };
      return ReactLib.createElement(View, { ...rest, style: [pad, style] }, children);
    },
    useSafeAreaInsets: () => insets(),
    useSafeAreaFrame: () => { const v = jest.requireActual('../../tools/ui-audit/adapters/react-native/harness').auditRuntimeState.viewport; return { x: 0, y: 0, width: v.width, height: v.height }; },
    initialWindowMetrics: null,
  };
});

describe('UI layout audit snapshot extraction', () => {
  it('extracts layout snapshots for the selected screens, states and profiles', async () => {
    const { written } = await runReactNativeAudit(uiAuditRegistry, { resetBetweenRuns: () => undefined });
    expect(written.length).toBeGreaterThan(0);
  }, 600_000);
});

