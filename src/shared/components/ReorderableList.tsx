import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, tapFeedback, useScrollControl } from './ui';

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
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const heightOf = (key: string) => heights.get(key) ?? 0;
  const [drag, setDrag] = useState<{ from: number; over: number; offset: number } | null>(null);
  const scroll = useScrollControl();
  // What the finger is doing and where the page was when the grab began; the row follows both.
  const pointer = useRef({ translation: 0, absoluteY: 0, startScroll: 0, from: -1 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  /** The row's offset from its slot: the finger's travel plus how far the page has scrolled since the grab. */
  const follow = () => {
    const { translation, startScroll, from } = pointer.current;
    const offset = translation + (scroll ? scroll.getOffset() - startScroll : 0);
    setDrag((current) => (current ? { ...current, offset, over: overFor(from, offset) } : current));
  };
  const start = (index: number) => {
    tapFeedback();
    pointer.current = { translation: 0, absoluteY: 0, startScroll: scroll?.getOffset() ?? 0, from: index };
    setDrag({ from: index, over: index, offset: 0 });
    stop();
    // Near the top or bottom edge of the screen the page scrolls on its own, faster the closer the finger is.
    timer.current = setInterval(() => {
      if (!scroll) return;
      const windowHeight = Dimensions.get('window').height;
      const { absoluteY } = pointer.current;
      const speed = absoluteY < EDGE_TOP ? -MAX_SPEED * Math.min(1, (EDGE_TOP - absoluteY) / EDGE_TOP)
        : absoluteY > windowHeight - EDGE_BOTTOM ? MAX_SPEED * Math.min(1, (absoluteY - (windowHeight - EDGE_BOTTOM)) / EDGE_BOTTOM) : 0;
      if (speed === 0) return;
      scroll.scrollTo(Math.max(0, scroll.getOffset() + speed));
      follow();
    }, 16);
  };

  const tops = () => {
    let top = 0;
    return items.map((item) => { const at = top; top += (heightOf(keyOf(item))) + gap; return at; });
  };
  /** The position the dragged row's centre has reached. */
  const overFor = (from: number, offset: number) => {
    const positions = tops();
    const height = heightOf(keyOf(items[from]));
    const centre = positions[from] + offset + height / 2;
    let over = from;
    items.forEach((item, index) => {
      const itemHeight = heightOf(keyOf(item));
      if (centre >= positions[index] && centre <= positions[index] + itemHeight + gap) over = index;
    });
    if (centre < 0) over = 0;
    return over;
  };

  return (
    <View style={{ gap }}>
      {items.map((item, index) => {
        const key = keyOf(item);
        const dragged = drag?.from === index;
        const grabbed = drag ? items[drag.from] : undefined;
        const travel = (grabbed ? heightOf(keyOf(grabbed)) : 0) + gap;
        // Rows between the grabbed one and where it would land make room for it.
        const shift = !drag || dragged ? 0
          : drag.over > drag.from && index > drag.from && index <= drag.over ? -travel
          : drag.over < drag.from && index < drag.from && index >= drag.over ? travel : 0;
        return (
          <View
            key={key}
            onLayout={(event) => {
              const { height, y } = event.nativeEvent.layout;
              setHeights((current) => (current.get(key) === height ? current : new Map(current).set(key, height)));
              onRowLayout?.(key, y);
            }}
            style={[dragged && styles.lifted, { transform: [{ translateY: dragged ? drag!.offset : shift }] }]}
          >
            {renderRow(item, index, {
              dragging: dragged,
              handle: (
                <Grip
                  name={nameOf(item)}
                  canUp={index > 0}
                  canDown={index < items.length - 1}
                  onStart={() => start(index)}
                  onUpdate={(translation, absoluteY) => { pointer.current.translation = translation; pointer.current.absoluteY = absoluteY; follow(); }}
                  onEnd={() => {
                    stop();
                    const done = drag;
                    setDrag(null);
                    if (done && done.over !== done.from) { tapFeedback('success'); onMove(done.from, done.over); }
                  }}
                  onNudge={(delta) => onMove(index, index + delta)}
                />
              ),
            })}
          </View>
        );
      })}
    </View>
  );
}

function Grip({ name, canUp, canDown, onStart, onUpdate, onEnd, onNudge }: {
  name: string;
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
        <Icon name="reorder-two" size={22} color={palette.textMuted} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  grip: { width: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  lifted: { zIndex: 10, elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
});
