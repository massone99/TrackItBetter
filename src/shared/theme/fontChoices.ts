import { Platform, type TextStyle } from "react-native";

/**
 * The fonts the user can choose from. The code names a font by one fixed family (`fonts.*` in typography.ts, the
 * IBM Plex names) which stands for a role and a weight; `Text` and the text inputs translate it into the family
 * chosen for that role. Nothing else needs to know which font is on.
 */
export type FontRole = "body" | "display" | "mono";
export type FontFamilyId = "plex" | "barlow" | "system";
export type FontSelection = Record<FontRole, FontFamilyId>;

export const FONT_ROLES: FontRole[] = ["body", "display", "mono"];
export const FONT_OPTIONS: Record<FontRole, FontFamilyId[]> = {
  body: ["plex", "barlow", "system"],
  display: ["plex", "barlow", "system"],
  mono: ["plex", "barlow", "system"],
};

export type FontPresetId = "technical" | "classic" | "system";
export const FONT_PRESETS: Record<FontPresetId, FontSelection> = {
  technical: { body: "plex", display: "plex", mono: "plex" },
  classic: { body: "barlow", display: "barlow", mono: "barlow" },
  system: { body: "system", display: "system", mono: "system" },
};
export const DEFAULT_FONTS: FontSelection = FONT_PRESETS.technical;

type Weight = 400 | 500 | 600 | 700;
type Table = Partial<Record<Weight, string>>;

/** Loaded families by role, choice and weight. `null`: the platform's own font. */
const FAMILIES: Record<FontRole, Record<FontFamilyId, Table | null>> = {
  body: {
    plex: { 400: "IBMPlexSans_400Regular", 500: "IBMPlexSans_500Medium", 600: "IBMPlexSans_600SemiBold", 700: "IBMPlexSans_700Bold" },
    barlow: { 400: "Barlow_400Regular", 500: "Barlow_500Medium", 600: "Barlow_600SemiBold", 700: "Barlow_700Bold" },
    system: null,
  },
  display: {
    plex: { 600: "IBMPlexSansCondensed_600SemiBold", 700: "IBMPlexSansCondensed_700Bold" },
    barlow: { 600: "BarlowCondensed_600SemiBold", 700: "BarlowCondensed_700Bold" },
    system: null,
  },
  mono: {
    plex: { 400: "IBMPlexMono_400Regular", 600: "IBMPlexMono_600SemiBold", 700: "IBMPlexMono_700Bold" },
    // Barlow has no mono face: its condensed digits are the closest "figures" look.
    barlow: { 600: "BarlowCondensed_600SemiBold", 700: "BarlowCondensed_700Bold" },
    system: null,
  },
};

const SYSTEM_FAMILY: Record<FontRole, string | undefined> = {
  body: undefined,
  display: Platform.select({ android: "sans-serif-condensed", ios: "Avenir Next Condensed", default: undefined }),
  mono: Platform.select({ android: "monospace", ios: "Menlo", default: "monospace" }),
};

/** Every family name the code uses (the Plex ones), with the role and weight it stands for. */
const SOURCES = new Map<string, { role: FontRole; weight: Weight }>();
for (const role of FONT_ROLES) {
  const table = FAMILIES[role].plex ?? {};
  for (const [weight, name] of Object.entries(table)) SOURCES.set(name, { role, weight: Number(weight) as Weight });
}

function nearestWeight(table: Table, wanted: Weight): string {
  const weights = (Object.keys(table).map(Number) as Weight[]);
  const best = weights.reduce((pick, weight) => (Math.abs(weight - wanted) < Math.abs(pick - wanted) ? weight : pick), weights[0]);
  return table[best] as string;
}

/** The style a Text or input needs for `family` (a Plex name used by the code) under the user's choices. */
export function resolveFont(family: string | undefined, selection: FontSelection): Pick<TextStyle, "fontFamily" | "fontWeight"> {
  if (!family) return {};
  const source = SOURCES.get(family);
  if (!source) return { fontFamily: family };
  const table = FAMILIES[source.role][selection[source.role]];
  if (table === null || table === undefined) {
    return { fontFamily: SYSTEM_FAMILY[source.role], fontWeight: String(source.weight) as TextStyle["fontWeight"] };
  }
  return { fontFamily: nearestWeight(table, source.weight) };
}

/** The choices that match a preset exactly, else null (a custom mix). */
export function presetOf(selection: FontSelection): FontPresetId | null {
  for (const id of Object.keys(FONT_PRESETS) as FontPresetId[]) {
    const preset = FONT_PRESETS[id];
    if (FONT_ROLES.every((role) => preset[role] === selection[role])) return id;
  }
  return null;
}

/** The family of a choice, for the sample in the settings (always that choice's own font). */
export function sampleFont(role: FontRole, id: FontFamilyId, weight: Weight): Pick<TextStyle, "fontFamily" | "fontWeight"> {
  const table = FAMILIES[role][id];
  if (table === null) return { fontFamily: SYSTEM_FAMILY[role], fontWeight: String(weight) as TextStyle["fontWeight"] };
  return { fontFamily: nearestWeight(table, weight) };
}

export function isFontFamilyId(value: string | null): value is FontFamilyId {
  return value === "plex" || value === "barlow" || value === "system";
}
