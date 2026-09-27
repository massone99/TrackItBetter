import { Text as NativeText, StyleSheet, TextProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { FONT_KEYS, scaleStyle } from "../theme/scale";
import { bodyFamilyForWeight } from "../theme/typography";

/**
 * App-wide Text: applies the Barlow family for the requested weight, a themed default color and the
 * interface scale chosen in settings (the one place font sizes are scaled).
 */
export function Text({ style, ...props }: TextProps) {
  const { palette, scale } = useTheme();
  const flat = StyleSheet.flatten(style) ?? {};
  const { fontWeight, fontFamily, ...rest } = flat;
  const sized = scaleStyle({ fontSize: 14, ...rest }, scale, FONT_KEYS);
  return (
    <NativeText
      {...props}
      style={[{ color: palette.text }, sized, { fontFamily: fontFamily ?? bodyFamilyForWeight(fontWeight) }]}
    />
  );
}
