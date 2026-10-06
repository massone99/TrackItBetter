// "Chalk, steel, birch": chalk-dusted concrete, steel bars, gym-mat blue, birch rings.
export const palettes = {
  light: {
    background: "#F2F4F5",
    surface: "#FFFFFF",
    surfaceMuted: "#E8EDF0",
    text: "#19262E",
    textMuted: "#536571",
    border: "#D6DFE5",
    accent: "#2F45C8",
    accentStrong: "#2F45C8",
    accentText: "#FFFFFF",
    accentSoft: "#DFE3F8",
    record: "#8A5517",
    recordSoft: "#F4E6D3",
    warning: "#A64A22",
    success: "#276F50",
    successSoft: "#E4F2EA",
    successText: "#FFFFFF",
    tabBar: "#FFFFFF",
    hero: "#2F45C8",
    heroText: "#FFFFFF",
    // Secondary text on `hero` (5.2:1 light, 5.5:1 dark).
    heroTextMuted: "rgba(255,255,255,0.78)",
    // Translucent fill for badges, tracks and buttons on `hero`; `heroText` on it stays above 4.9:1.
    heroOverlay: "rgba(255,255,255,0.18)",
    // The same fill on an `accent` surface; `accentText` on it stays above 4.9:1.
    accentOverlay: "rgba(255,255,255,0.18)",
    // Dark backdrop behind photos and video while they load or letterbox.
    mediaBackdrop: "#141A1F",
    // Scrim behind labels laid over photos; `onMedia` on it over a white photo is 5.7:1.
    mediaScrim: "rgba(0,0,0,0.6)",
    // Text and icons on media, scrims and `mediaBackdrop`.
    onMedia: "#FFFFFF",
  },
  dark: {
    background: "#111A21",
    surface: "#1B2730",
    surfaceMuted: "#283742",
    text: "#F0F4F7",
    textMuted: "#A9B8C4",
    border: "#354652",
    accent: "#8B9BFF",
    accentStrong: "#A4B0FF",
    accentText: "#10152A",
    accentSoft: "#262F52",
    record: "#E2AE6E",
    recordSoft: "#3A2F22",
    warning: "#EE9A74",
    success: "#6FCB9F",
    successSoft: "#203D33",
    successText: "#102B20",
    tabBar: "#181E29",
    hero: "#3144B8",
    heroText: "#FFFFFF",
    heroTextMuted: "rgba(255,255,255,0.78)",
    heroOverlay: "rgba(255,255,255,0.18)",
    // Dark `accent` carries dark `accentText`, so the overlay darkens instead (5.4:1).
    accentOverlay: "rgba(16,21,42,0.16)",
    mediaBackdrop: "#0B1014",
    mediaScrim: "rgba(0,0,0,0.6)",
    onMedia: "#FFFFFF",
  },
} as const;

export type ThemeMode = keyof typeof palettes;
export type Palette = { [K in keyof (typeof palettes)["light"]]: string };
