import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";
import { useColorScheme, useWindowDimensions } from "react-native";
import { readPreference, writePreference } from "../settings/preferences";
import { Palette, palettes, ThemeMode } from "./palette";
import { DEFAULT_FONTS, FONT_PRESETS, FONT_ROLES, isFontFamilyId, type FontFamilyId, type FontPresetId, type FontRole, type FontSelection } from "./fontChoices";
import { parseSetLayout, setLayoutKey, type SetLayout } from "./setLayout";
import { effectiveScale, LARGE_TEXT_SCALE, TEXT_SCALE_CAPS, toUiScale, type TextScaleMode, type UiScale } from "./scale";

type ThemePreference = ThemeMode | "system";

type ThemeContextValue = {
  mode: ThemeMode;
  preference: ThemePreference;
  palette: Palette;
  setMode: (mode: ThemePreference) => void;
  /** Interface size multiplier chosen in settings (85–130 %). */
  scale: UiScale;
  /** `scale` adjusted to the window width: what layouts and text are multiplied by. */
  layoutScale: number;
  setScale: (scale: UiScale) => void;
  /** The phone's font size factor, capped by `textScaleMode`; text is multiplied by it (see textGrowth). */
  fontScale: number;
  /** True from 150 % text on: shared layouts stack what no longer fits in a row. */
  largeText: boolean;
  textScaleMode: TextScaleMode;
  setTextScaleMode: (mode: TextScaleMode) => void;
  /** The family chosen for each role (text, titles, figures). */
  fontSelection: FontSelection;
  setFontFamily: (role: FontRole, family: FontFamilyId) => void;
  setFontPreset: (preset: FontPresetId) => void;
  /** How exercise cards list their sets and how big the set buttons are. */
  setLayout: SetLayout;
  updateSetLayout: <K extends keyof SetLayout>(key: K, value: SetLayout[K]) => void;
};

const THEME_KEY = "appearance.theme";
const SCALE_KEY = "appearance.scale";
const TEXT_SCALE_KEY = "appearance.textScale";
const fontKey = (role: FontRole) => `appearance.font.${role}`;
const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialPreference(): ThemePreference {
  const stored = readPreference(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const [scale, setScaleState] = useState<UiScale>(() => toUiScale(readPreference(SCALE_KEY)));
  const [textScaleMode, setTextScaleModeState] = useState<TextScaleMode>(() => (readPreference(TEXT_SCALE_KEY) === "limited" ? "limited" : "full"));
  const [fontSelection, setFontSelection] = useState<FontSelection>(() => {
    const chosen = { ...DEFAULT_FONTS };
    for (const role of FONT_ROLES) {
      const stored = readPreference(fontKey(role));
      if (isFontFamilyId(stored)) chosen[role] = stored;
    }
    return chosen;
  });
  const [setLayout, setSetLayout] = useState<SetLayout>(() => parseSetLayout(readPreference));
  const updateSetLayout = useCallback(<K extends keyof SetLayout>(key: K, next: SetLayout[K]) => {
    setSetLayout((current) => ({ ...current, [key]: next }));
    writePreference(setLayoutKey(key), next);
  }, []);
  const { width, fontScale: systemFontScale } = useWindowDimensions();
  // Development builds on web can simulate a phone font size with globalThis.__fontScale.
  const simulated = (globalThis as { __fontScale?: number }).__fontScale;
  const fontScale = Math.round(Math.min(Math.max(1, simulated ?? systemFontScale ?? 1), TEXT_SCALE_CAPS[textScaleMode]) * 100) / 100;
  const largeText = fontScale >= LARGE_TEXT_SCALE;
  const layoutScale = effectiveScale(scale, width);
  const mode = preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
  const setMode = useCallback((next: ThemePreference) => {
    setPreference(next);
    writePreference(THEME_KEY, next);
  }, []);
  const setScale = useCallback((next: UiScale) => {
    setScaleState(next);
    writePreference(SCALE_KEY, String(next));
  }, []);
  const setTextScaleMode = useCallback((next: TextScaleMode) => {
    setTextScaleModeState(next);
    writePreference(TEXT_SCALE_KEY, next);
  }, []);
  const setFontFamily = useCallback((role: FontRole, family: FontFamilyId) => {
    setFontSelection((current) => ({ ...current, [role]: family }));
    writePreference(fontKey(role), family);
  }, []);
  const setFontPreset = useCallback((preset: FontPresetId) => {
    setFontSelection({ ...FONT_PRESETS[preset] });
    for (const role of FONT_ROLES) writePreference(fontKey(role), FONT_PRESETS[preset][role]);
  }, []);
  const value = useMemo(
    () => ({ mode, preference, palette: palettes[mode], setMode, scale, layoutScale, setScale, fontScale, largeText, textScaleMode, setTextScaleMode, fontSelection, setFontFamily, setFontPreset, setLayout, updateSetLayout }),
    [mode, preference, setMode, scale, layoutScale, setScale, fontScale, largeText, textScaleMode, setTextScaleMode, fontSelection, setFontFamily, setFontPreset, setLayout, updateSetLayout],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
