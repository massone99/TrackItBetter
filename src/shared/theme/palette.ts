// "Chalk, steel, birch": chalk-dusted concrete, steel bars, gym-mat blue, birch rings.
export const palettes = {
  light: {
    background: "#EEF1F4",
    surface: "#FFFFFF",
    surfaceMuted: "#E2E7ED",
    text: "#1C2330",
    textMuted: "#5B6576",
    border: "#D5DCE4",
    accent: "#2F45C8",
    accentStrong: "#2F45C8",
    accentText: "#FFFFFF",
    accentSoft: "#DFE3F8",
    record: "#B97B34",
    recordSoft: "#F4E6D3",
    warning: "#B4532A",
    success: "#2E7D5B",
    tabBar: "#FFFFFF",
    hero: "#2F45C8",
    heroText: "#FFFFFF",
  },
  dark: {
    background: "#141922",
    surface: "#1D2430",
    surfaceMuted: "#273041",
    text: "#EEF1F6",
    textMuted: "#9AA5B8",
    border: "#2F394B",
    accent: "#8B9BFF",
    accentStrong: "#A4B0FF",
    accentText: "#10152A",
    accentSoft: "#262F52",
    record: "#E2AE6E",
    recordSoft: "#3A2F22",
    warning: "#EE9A74",
    success: "#6FCB9F",
    tabBar: "#181E29",
    hero: "#3144B8",
    heroText: "#FFFFFF",
  },
} as const;

export type ThemeMode = keyof typeof palettes;
export type Palette = { [K in keyof (typeof palettes)["light"]]: string };
