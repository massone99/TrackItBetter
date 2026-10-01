import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '../theme/ThemeProvider';
import { useAnimationSettings } from '../settings/AnimationProvider';
import { tapFeedback, useScrollControl } from './ui';

/** Distance from the screen's top and bottom edge inside which a drag scrolls the page, and its top speed (px per frame). */
const EDGE_TOP = 150;
const EDGE_BOTTOM = 170;
const MAX_SPEED = 18;

/** What a row gets to place in its header: the grip that starts the drag. */
export interface ReorderRow { handle: ReactNode; dragging: boolean }

/**
 * A vertical list whose rows are reordered by dragging their grip. Only the grip drags (after a
 * brief hold), so a row keeps its own tap and long-press behaviour and the page still scrolls.
 * Screen readers get move up / move down actions on the grip instead.
 */
export function ReorderableList<T>({ items, keyOf, nameOf, gap = 12, onMove, onRowLayout, renderRow }: {
  items: readonly T[];
  keyOf: (item: T) => string;
  nameOf: (item: T) => string;
  gap?: number;
  onMove: (from: number, to: number) => void;
  /** Reports each row's top inside the list, e.g. to scroll to it. */
  onRowLayout?: (key: string, top: number) => void;
  renderRow: (item: T, index: number, row: ReorderRow) => ReactNode;
}) {
  // Row heights live in a ref: they are only read while dragging, so a layout never re-renders the list.
  const heights = useRef(new Map<string, number>());
  const heightOf = (key: string) => heights.current.get(key) ?? 0;
  // Only which row is lifted is React state; the finger's travel and the neighbours' shifts are
  // shared values, so a drag frame moves views on the UI thread instead of re-rendering every row.
  const [lifted, setLifted] = useState<number | null>(null);
  const motion = {
    from: useSharedValue(-1),
    over: useSharedValue(-1),
    offset: useSharedValue(0),
    travel: useSharedValue(0),
  };
  const scroll = useScrollControl();
  // Follows rotation and window resizing (split screen, foldables) instead of reading the screen once.
  const { height: windowHeight } = useWindowDimensions();
  const { duration } = useAnimationSettings();
  const shiftMs = duration(140);
  // What the finger is doing and where the page was when the grab began; the row follows both.
  const pointer = useRef({ translation: 0, absoluteY: 0, startScroll: 0, from: -1, over: -1 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  /** The row's offset from its slot: the finger's travel plus how far the page has scrolled since the grab. */
  const follow = () => {
    const { translation, startScroll, from } = pointer.current;
    const offset = translation + (scroll ? scroll.getOffset() - startScroll : 0);
    const over = overFor(from, offset);
    pointer.current.over = over;
    motion.offset.value = offset;
    if (motion.over.value !== over) motion.over.value = over;
  };
  const start = (index: number) => {
    tapFeedback();
    pointer.current = { translation: 0, absoluteY: 0, startScroll: scroll?.getOffset() ?? 0, from: index, over: index };
    motion.travel.value = heightOf(keyOf(items[index])) + gap;
    motion.offset.value = 0;
    motion.over.value = index;
    motion.from.value = index;
    setLifted(index);
    stop();
    // Near the top or bottom edge of the screen the page scrolls on its own, faster the closer the finger is.
    timer.current = setInterval(() => {
      if (!scroll) return;
      const { absoluteY } = pointer.current;
      const speed = absoluteY < EDGE_TOP ? -MAX_SPEED * Math.min(1, (EDGE_TOP - absoluteY) / EDGE_TOP)
        : absoluteY > windowHeight - EDGE_BOTTOM ? MAX_SPEED * Math.min(1, (absoluteY - (windowHeight - EDGE_BOTTOM)) / EDGE_BOTTOM) : 0;
      if (speed === 0) return;
      scroll.scrollTo(Math.max(0, scroll.getOffset() + speed));
      follow();
    }, 16);
  };
  const finish = () => {
    stop();
    const { from, over } = pointer.current;
    if (from < 0) return;
    pointer.current.from = -1;
    motion.from.value = -1;
    motion.over.value = -1;
    motion.offset.value = 0;
    setLifted(null);
    if (over !== from) { tapFeedback('success'); onMove(from, over); }
  };

  /** The position the dragged row's centre has reached. */
  const overFor = (from: number, offset: number) => {
    let top = 0;
    const positions = items.map((item) => { const at = top; top += heightOf(keyOf(item)) + gap; return at; });
    const centre = positions[from] + offset + heightOf(keyOf(items[from])) / 2;
    let over = from;
    items.forEach((item, index) => {
      if (centre >= positions[index] && centre <= positions[index] + heightOf(keyOf(item)) + gap) over = index;
    });
    if (centre < 0) over = 0;
    return over;
  };

  return (
    <View style={{ gap }}>
      {items.map((item, index) => {
        const key = keyOf(item);
        const dragged = lifted === index;
        return (
          <Row
            key={key}
            index={index}
            motion={motion}
            shiftMs={shiftMs}
            dragged={dragged}
            onLayout={(event) => {
              const { height, y } = event.nativeEvent.layout;
              heights.current.set(key, height);
              onRowLayout?.(key, y);
            }}
          >
            {renderRow(item, index, {
              dragging: dragged,
              handle: (
                <Grip
                  name={nameOf(item)}
                  active={dragged}
                  canUp={index > 0}
                  canDown={index < items.length - 1}
                  onStart={() => start(index)}
                  onUpdate={(translation, absoluteY) => { pointer.current.translation = translation; pointer.current.absoluteY = absoluteY; follow(); }}
                  onEnd={finish}
                  onNudge={(delta) => onMove(index, index + delta)}
                />
              ),
            })}
          </Row>
        );
      })}
    </View>
  );
}

interface Motion { from: SharedValue<number>; over: SharedValue<number>; offset: SharedValue<number>; travel: SharedValue<number> }

/** One row: follows the finger when lifted, slides out of the way when the lifted row passes it. */
function Row({ index, motion, shiftMs, dragged, onLayout, children }: {
  index: number;
  motion: Motion;
  shiftMs: number;
  dragged: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const animated = useAnimatedStyle(() => {
    const from = motion.from.value;
    if (from < 0) return { transform: [{ translateY: 0 }] };
    if (index === from) return { transform: [{ translateY: motion.offset.value }] };
    const over = motion.over.value;
    const shift = over > from && index > from && index <= over ? -motion.travel.value
      : over < from && index < from && index >= over ? motion.travel.value : 0;
    return { transform: [{ translateY: withTiming(shift, { duration: shiftMs }) }] };
  });
  return <Animated.View onLayout={onLayout} style={[dragged && styles.lifted, animated]}>{children}</Animated.View>;
}

/** The six-dot drag grip (two columns of three), drawn so it reads as "drag me" rather than as a menu. */
function GripDots({ color }: { color: string }) {
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.dotRow}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <View style={[styles.dot, { backgroundColor: color }]} />
        </View>
      ))}
    </View>
  );
}

function Grip({ name, active, canUp, canDown, onStart, onUpdate, onEnd, onNudge }: {
  name: string;
  active: boolean;
  canUp: boolean;
  canDown: boolean;
  onStart: () => void;
  onUpdate: (translation: number, absoluteY: number) => void;
  onEnd: () => void;
  onNudge: (delta: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(140)
    .onStart(onStart)
    .onUpdate((event) => onUpdate(event.translationY, event.absoluteY))
    .onEnd(onEnd)
    .onFinalize((_event, success) => { if (!success) onEnd(); });
  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('reorder.handle', { name })}
        accessibilityHint={t('reorder.hint')}
        accessibilityActions={[
          ...(canUp ? [{ name: 'decrement', label: t('reorder.up') }] : []),
          ...(canDown ? [{ name: 'increment', label: t('reorder.down') }] : []),
        ]}
        onAccessibilityAction={(event) => onNudge(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 10 }}
        style={styles.grip}
      >
        <GripDots color={active ? palette.accentStrong : palette.textMuted} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  grip: { width: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  dots: { gap: 4 },
  dotRow: { flexDirection: 'row', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  lifted: { zIndex: 10, elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
});
