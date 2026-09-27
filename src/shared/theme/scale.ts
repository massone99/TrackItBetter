export const UI_SCALES = [0.85, 0.92, 1, 1.1] as const;
export type UiScale = (typeof UI_SCALES)[number];

export function toUiScale(value: unknown): UiScale {
  const numeric = Number(value);
  return (UI_SCALES as readonly number[]).includes(numeric) ? (numeric as UiScale) : 1;
}

// Layout sizes that follow the interface scale. Font metrics are scaled once, in the shared Text component.
const LAYOUT_KEYS = new Set([
  "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
  "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "paddingHorizontal", "paddingVertical",
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginHorizontal", "marginVertical",
  "gap", "rowGap", "columnGap",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
  "top", "bottom", "left", "right",
]);

export const FONT_KEYS = new Set(["fontSize", "lineHeight", "letterSpacing"]);

/** Multiplies numeric layout sizes of one style object; strings (percentages) and other keys are kept. */
export function scaleStyle<T extends object>(style: T, scale: number, keys: Set<string> = LAYOUT_KEYS): T {
  if (scale === 1) return style;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    result[key] = typeof value === "number" && keys.has(key) ? Math.round(value * scale * 10) / 10 : value;
  }
  return result as T;
}

/** Scales every style in a StyleSheet object for the current interface size. */
export function scaleStyles<T extends Record<string, object>>(styles: T, scale: number): T {
  if (scale === 1) return styles;
  const result: Record<string, object> = {};
  for (const [name, style] of Object.entries(styles)) result[name] = scaleStyle(style, scale);
  return result as T;
}
