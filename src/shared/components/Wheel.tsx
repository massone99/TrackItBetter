import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fonts } from '../theme/typography';
import { Text } from './Text';
import { tapFeedback } from './ui';
import { MIN_TOUCH_TARGET, radii } from '../theme/tokens';
import { cappedTextGrowth } from '../theme/scale';

const VISIBLE = 5;
/** Size of the selected value; the others are drawn at 20. */
const SELECTED_FONT = 26;

/**
 * Height of one row: room for the selected value at the current interface and text size (rows must all
 * be the same height for the drum to snap), never less than a 48 dp touch target.
 */
function itemHeight(layoutScale: number, fontScale: number): number {
  const font = SELECTED_FONT * layoutScale;
  return Math.max(MIN_TOUCH_TARGET, Math.ceil(font * cappedTextGrowth(font, fontScale, layoutScale) * 1.4));
}

export type WheelItem = { value: number; label: string };

/**
 * Drum-style column: scroll or tap to bring a value under the highlighted band. Commits once
 * the scroll settles, so it works the same with a finger, a mouse wheel and a screen reader tap.
 */
export function Wheel({ items, value, label, width = 84, onChange }: {
  items: WheelItem[];
  value: number;
  /** Accessible name of the column, e.g. "Minutes". */
  label: string;
  width?: number;
  onChange: (value: number) => void;
}) {
  const { palette, layoutScale, fontScale } = useTheme();
  const rowHeight = itemHeight(layoutScale, fontScale);
  const columnWidth = Math.round(width * layoutScale);
  const scroll = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.value === value));
  const [live, setLive] = useState(selectedIndex);
  const committed = useRef(selectedIndex);

  useEffect(() => () => { if (settle.current) clearTimeout(settle.current); }, []);
  // contentOffset is ignored on web, so the position is set explicitly once mounted (and when the row height changes).
  useEffect(() => {
    const start = setTimeout(() => scroll.current?.scrollTo({ y: committed.current * rowHeight, animated: false }), 0);
    return () => clearTimeout(start);
  }, [rowHeight]);
  // A value changed from outside (a preset, the default) moves the drum to it.
  useEffect(() => {
    if (committed.current !== selectedIndex) {
      committed.current = selectedIndex;
      setLive(selectedIndex);
      scroll.current?.scrollTo({ y: selectedIndex * rowHeight, animated: true });
    }
  }, [selectedIndex, rowHeight]);

  const indexAt = (y: number) => Math.min(items.length - 1, Math.max(0, Math.round(y / rowHeight)));
  const onScroll = (y: number) => {
    setLive(indexAt(y));
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const index = indexAt(y);
      scroll.current?.scrollTo({ y: index * rowHeight, animated: true });
      if (index !== committed.current) {
        committed.current = index;
        tapFeedback();
        onChange(items[index].value);
      }
    }, 140);
  };

  return (
    <View accessibilityLabel={label} style={{ width: columnWidth, height: rowHeight * VISIBLE }}>
      <View pointerEvents="none" style={[styles.band, { height: rowHeight, backgroundColor: palette.accentSoft, top: rowHeight * 2 }]} />
      <ScrollView
        ref={scroll}
        showsVerticalScrollIndicator={false}
        snapToInterval={rowHeight}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: selectedIndex * rowHeight }}
        contentContainerStyle={{ paddingVertical: rowHeight * 2 }}
        onScroll={(event) => onScroll(event.nativeEvent.contentOffset.y)}
      >
        {items.map((item, index) => {
          const distance = Math.abs(index - live);
          return (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${item.label}`}
              accessibilityState={{ selected: index === selectedIndex }}
              onPress={() => scroll.current?.scrollTo({ y: index * rowHeight, animated: true })}
              style={[styles.item, { height: rowHeight }]}
            >
              <Text style={[styles.text, { color: distance === 0 ? palette.accentStrong : palette.text, opacity: distance === 0 ? 1 : distance === 1 ? 0.55 : 0.25, fontSize: distance === 0 ? SELECTED_FONT : 20 }]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, borderRadius: radii.control },
  item: { alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.display, fontVariant: ['tabular-nums'] },
});
