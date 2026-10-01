/** Shared native UI measurements. Layout values follow the user's interface scale. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, section: 24, page: 20 } as const;

export const radii = { small: 8, control: 12, surface: 16, sheet: 28, pill: 999 } as const;

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
