import { useEffect } from "react";
import { useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";
import { readPreference, writePreference } from "../settings/preferences";

const NAV_BAR_KEY = "layout.navBarHeight";

// Read once per app run: the stored height only changes when the phone reports a different one.
let remembered: number | null = null;
function rememberedNavBar(): number {
  if (remembered === null) {
    const stored = Number(readPreference(NAV_BAR_KEY));
    remembered = Number.isFinite(stored) && stored > 0 ? stored : 0;
  }
  return remembered;
}

/**
 * Safe-area insets whose bottom never drops to zero once the navigation bar height is known.
 * Some Android screens (edge-to-edge modals, the first frame after launch) report a bottom inset
 * of 0 while the system bar is still drawn over the app; the last real height is used instead.
 */
export function useAppInsets(): EdgeInsets {
  const insets = useSafeAreaInsets();
  const measured = Math.round(insets.bottom);
  useEffect(() => {
    if (measured > 0 && measured !== rememberedNavBar()) {
      remembered = measured;
      writePreference(NAV_BAR_KEY, String(measured));
    }
  }, [measured]);
  return { ...insets, bottom: measured > 0 ? measured : rememberedNavBar() };
}
