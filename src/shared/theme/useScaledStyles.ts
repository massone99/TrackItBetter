import { useMemo } from "react";
import { scaleStyles } from "./scale";
import { useTheme } from "./ThemeProvider";

/** Returns the StyleSheet with layout sizes scaled to the interface size chosen in settings. */
export function useScaledStyles<T extends Record<string, object>>(styles: T): T {
  const { scale } = useTheme();
  return useMemo(() => scaleStyles(styles, scale), [styles, scale]);
}
