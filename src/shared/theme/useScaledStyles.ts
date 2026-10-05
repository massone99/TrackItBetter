import { useMemo } from "react";
import { scaleStyles } from "./scale";
import { useTheme } from "./ThemeProvider";

// One scaled copy per style sheet and scale, shared by every component that uses the sheet.
const cache = new WeakMap<object, { scale: number; styles: object }>();

/** Returns the StyleSheet with layout sizes scaled to the interface size chosen in settings. */
export function useScaledStyles<T extends Record<string, object>>(styles: T): T {
  const { layoutScale } = useTheme();
  return useMemo(() => {
    const hit = cache.get(styles);
    if (hit?.scale === layoutScale) return hit.styles as T;
    const scaled = scaleStyles(styles, layoutScale);
    cache.set(styles, { scale: layoutScale, styles: scaled });
    return scaled;
  }, [styles, layoutScale]);
}
