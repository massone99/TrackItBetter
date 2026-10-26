import { Text as NativeText, StyleSheet, TextProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { FONT_KEYS, scaleStyle, textGrowth } from "../theme/scale";
import { bodyFamilyForWeight } from "../theme/typography";

/**
 * App-wide Text: applies the IBM Plex family for the requested weight, a themed default color, the
 * interface scale chosen in settings and the phone's font size (the one place font sizes are scaled).
 * The system scaling is applied here rather than by the OS, so it can be capped by the setting and
 * eased for large sizes (see textGrowth).
 */
export function Text({ style, maxFontSizeMultiplier, ...props }: TextProps) {
  const { palette, layoutScale: scale, fontScale } = useTheme();
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, fontFamily, ...rest } = flat;
  const sized = scaleStyle({ fontSize: 14, ...rest }, scale, FONT_KEYS);
  // A caller's maxFontSizeMultiplier still caps the growth (e.g. tab labels in a fixed-height bar).
  const grow = Math.min(textGrowth(sized.fontSize ?? 14, fontScale), maxFontSizeMultiplier ?? Infinity);
  const grown = grow === 1 ? sized : {
    ...sized,
    fontSize: Math.round((sized.fontSize ?? 14) * grow * 10) / 10,
    ...(typeof sized.lineHeight === "number" ? { lineHeight: Math.round(sized.lineHeight * grow * 10) / 10 } : {}),
  };
  return (
    <NativeText
      {...props}
      allowFontScaling={false}
      style={[{ color: palette.text }, grown, { fontFamily: fontFamily ?? bodyFamilyForWeight(fontWeight) }]}
    />
  );
}
