/** Shared native UI measurements. Layout values follow the user's interface scale. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, section: 24, page: 20 } as const;

/**
 * Depth: a soft, low shadow that lifts surfaces off the page in the light theme. In the dark theme
 * shadows disappear against the background, so surfaces keep their border and tonal step instead.
 */
export const elevation = {
  surface: { shadowColor: '#1C2330', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
} as const;

/** Squared look: every corner is 4 dp (pill and sheet included), small details 2 dp. */
export const radii = { small: 2, control: 4, surface: 4, sheet: 4, pill: 4 } as const;

export const typeScale = {
  title: { fontSize: 36, lineHeight: 40, letterSpacing: -0.4 },
  section: { fontSize: 23, lineHeight: 28 },
  heading: { fontSize: 18, lineHeight: 25 },
  body: { fontSize: 15, lineHeight: 22 },
  label: { fontSize: 13, lineHeight: 19 },
  metric: { fontSize: 40, lineHeight: 44 },
} as const;

/** Touch targets stay usable even at the smallest interface setting. */
export const MIN_TOUCH_TARGET = 48;

/** Instrument look (workout): square-cornered sheets drawn with thin ink lines. */
export const instrument = { radius: radii.control, line: 1, mark: 8, gauge: 14 } as const;
