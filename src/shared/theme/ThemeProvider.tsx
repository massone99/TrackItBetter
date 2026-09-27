import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { readPreference, writePreference } from "../settings/preferences";
import { Palette, palettes, ThemeMode } from "./palette";
import { toUiScale, type UiScale } from "./scale";

type ThemePreference = ThemeMode | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  preference: ThemePreference;
  palette: Palette;
  setMode: (mode: ThemePreference) => void;
  /** Interface size multiplier chosen in settings (85–110 %). */
  scale: UiScale;
  setScale: (scale: UiScale) => void;
};

const THEME_KEY = "appearance.theme";
const SCALE_KEY = "appearance.scale";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialPreference(): ThemePreference {
  const stored = readPreference(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [scale, setScaleState] = useState<UiScale>(() => toUiScale(readPreference(SCALE_KEY)));
  const mode = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
  const setMode = useCallback((next: ThemePreference) => {
    setPreference(next);
    writePreference(THEME_KEY, next);
  }, []);
  const setScale = useCallback((next: UiScale) => {
    setScaleState(next);
    writePreference(SCALE_KEY, String(next));
  }, []);
  const value = useMemo(
    () => ({ mode, preference, palette: palettes[mode], setMode, scale, setScale }),
    [mode, preference, setMode, scale, setScale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
