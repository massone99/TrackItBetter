export const UI_SCALES = [0.7, 0.78, 0.85, 0.92, 1, 1.1, 1.2, 1.3] as const;
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
  "gap", "rowGap", "columnGap", "flexBasis",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
  "top", "bottom", "left", "right",
]);

/** Text inputs follow the system font size up to this factor (single-line fields stay usable). */
export const MAX_FONT_SCALE = 1.6;

/** How far the app follows the phone's font size: up to 140 % (compact) or up to 200 % (full). */
export type TextScaleMode = 'limited' | 'full';
export const TEXT_SCALE_CAPS: Record<TextScaleMode, number> = { limited: 1.4, full: 2 };
/** From this font scale on, shared layouts stack rows that would no longer fit side by side. */
export const LARGE_TEXT_SCALE = 1.5;
/** Text size times interface size from which the same stacking applies (a row of steppers no longer fits). */
export const STACK_TEXT_SCALE = 1.25;

/**
 * Growth applied to one text size for a system font scale. Body text follows it fully; headings grow
 * less and large numbers (timers, titles) least, as on iOS Dynamic Type: they are already readable and
 * would otherwise push everything else off the screen.
 */
export function textGrowth(fontSize: number, fontScale: number): number {
  if (fontScale <= 1) return 1;
  // Titles, timers and big numbers (28 dp and up) barely grow: they are already readable.
  const share = fontSize >= 28 ? 0.1 : fontSize >= 20 ? 0.7 : 1;
  return 1 + (fontScale - 1) * share;
}

/**
 * Most text grows overall (interface size times the phone's font size): 200 %, what WCAG asks for.
 * Past it the interface size still enlarges spacing and controls, but no longer the text, so a
 * 130 % interface with 200 % system text does not put 2.6 times larger words into a 360 dp screen.
 */
export const MAX_TEXT_ZOOM = 2;

/** Growth for one (already interface-scaled) text size, kept within MAX_TEXT_ZOOM overall. */
export function cappedTextGrowth(fontSize: number, fontScale: number, layoutScale: number): number {
  const grow = textGrowth(fontSize, fontScale);
  return Math.max(1, Math.min(grow, MAX_TEXT_ZOOM / Math.max(layoutScale, 0.01)));
}

/** Smallest rendered text (dp): a small interface size never shrinks words below it (WCAG, glanced at mid-set). */
export const MIN_FONT_SIZE = 12;

/** Raises a font size under MIN_FONT_SIZE to it, growing a numeric lineHeight by the same factor. */
export function withMinFontSize<T extends { fontSize?: number; lineHeight?: number }>(style: T): T {
  const size = style.fontSize;
  if (typeof size !== "number" || size >= MIN_FONT_SIZE || size <= 0) return style;
  const factor = MIN_FONT_SIZE / size;
  return {
    ...style,
    fontSize: MIN_FONT_SIZE,
    ...(typeof style.lineHeight === "number" ? { lineHeight: Math.round(style.lineHeight * factor * 10) / 10 } : {}),
  };
}

/**
 * The interface size actually used for layout: the chosen one, tightened a little on narrow phones so
 * rows that fit a 390 dp screen still fit a 320 dp one.
 */
export function effectiveScale(scale: number, windowWidth: number): number {
  const narrow = windowWidth > 0 && windowWidth < 340 ? 0.9 : windowWidth > 0 && windowWidth < 360 ? 0.95 : 1;
  return Math.round(scale * narrow * 100) / 100;
}

export const FONT_KEYS = new Set(["fontSize", "lineHeight", "letterSpacing"]);

/** Smallest touch target (dp); kept here so the scale helpers do not depend on the tokens module. */
const TOUCH_TARGET = 48;
/** Sizes that make a touch target: one designed at 48 dp or more never shrinks below 48 at a small interface size. */
const TARGET_KEYS = new Set(["width", "height", "minWidth", "minHeight"]);

/**
 * Multiplies numeric layout sizes of one style object; strings (percentages) and other keys are kept.
 * Widths and heights of 48 dp or more stay at least 48 dp, so touch targets survive the 70 % interface size.
 */
export function scaleStyle<T extends object>(style: T, scale: number, keys: Set<string> = LAYOUT_KEYS): T {
  if (scale === 1) return style;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style)) {
    if (typeof value !== "number" || !keys.has(key)) {
      result[key] = value;
      continue;
    }
    const scaled = Math.round(value * scale * 10) / 10;
    result[key] = TARGET_KEYS.has(key) && value >= TOUCH_TARGET ? Math.max(scaled, TOUCH_TARGET) : scaled;
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
