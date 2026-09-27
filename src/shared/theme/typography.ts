import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from "@expo-google-fonts/barlow";
import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from "@expo-google-fonts/barlow-condensed";

export const fontAssets = {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
};

export const fonts = {
  body: "Barlow_400Regular",
  medium: "Barlow_500Medium",
  semibold: "Barlow_600SemiBold",
  bold: "Barlow_700Bold",
  display: "BarlowCondensed_700Bold",
  displayMedium: "BarlowCondensed_600SemiBold",
} as const;

/** Custom fonts ignore fontWeight on Android, so weights map to explicit families. */
export function bodyFamilyForWeight(weight: string | number | undefined): string {
  const numeric = weight === "bold" ? 700 : Number(weight ?? 400);
  if (numeric >= 700) return fonts.bold;
  if (numeric >= 600) return fonts.semibold;
  if (numeric >= 500) return fonts.medium;
  return fonts.body;
}
