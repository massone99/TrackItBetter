import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from "@expo-google-fonts/ibm-plex-sans";
import {
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
} from "@expo-google-fonts/ibm-plex-sans-condensed";
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from "@expo-google-fonts/ibm-plex-mono";

/** IBM Plex: Sans for text, Sans Condensed for capitals headings and buttons, Mono for figures and tags. */
export const fontAssets = {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  IBMPlexSansCondensed_600SemiBold,
  IBMPlexSansCondensed_700Bold,
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
};

export const fonts = {
  body: "IBMPlexSans_400Regular",
  medium: "IBMPlexSans_500Medium",
  semibold: "IBMPlexSans_600SemiBold",
  bold: "IBMPlexSans_700Bold",
  display: "IBMPlexSansCondensed_700Bold",
  displayMedium: "IBMPlexSansCondensed_600SemiBold",
  /** Figures, tags and units (tabular, technical). */
  mono: "IBMPlexMono_400Regular",
  monoSemibold: "IBMPlexMono_600SemiBold",
  monoBold: "IBMPlexMono_700Bold",
} as const;

/** Custom fonts ignore fontWeight on Android, so weights map to explicit families. */
export function bodyFamilyForWeight(weight: string | number | undefined): string {
  const numeric = weight === "bold" ? 700 : Number(weight ?? 400);
  if (numeric >= 700) return fonts.bold;
  if (numeric >= 600) return fonts.semibold;
  if (numeric >= 500) return fonts.medium;
  return fonts.body;
}
