import { Tabs } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppInsets } from "../../src/shared/layout/useAppInsets";
import { Icon, IconName } from "../../src/shared/components/Icon";
import { Text } from "../../src/shared/components/Text";
import { useInk } from "../../src/shared/theme/ink";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { fonts } from "../../src/shared/theme/typography";
import { MIN_TOUCH_TARGET, radii } from "../../src/shared/theme/tokens";
// Tab labels grow with the system font only this far: five of them share a 360 dp row, and
// "PROGRAMMI" in mono capitals fills its 72 dp cell at 1.0, so labels stay at their base size
// (the icon carries the meaning; screen readers get the full label).
const LABEL_MAX_SCALE = 1;

const icons: Record<string, [IconName, IconName]> = {
  today: ["sunny-outline", "sunny"],
  log: ["calendar-clear-outline", "calendar-clear"],
  progress: ["trending-up-outline", "trending-up"],
  programs: ["barbell-outline", "barbell"],
  profile: ["person-circle-outline", "person-circle"],
};

export default function TabLayout() {
  const { palette, layoutScale: scale, fontScale } = useTheme();
  const ink = useInk();
  const { t } = useTranslation();
  const insets = useAppInsets();
  const expanded = useWindowDimensions().width >= 768;
  // Labels follow the system font size (up to the app-wide cap), so the bar grows with them.
  const labelScale = Math.min(fontScale, LABEL_MAX_SCALE);
  const barHeight = Math.max(64, Math.round(64 * scale)) + Math.round(16 * scale * (labelScale - 1) * 2.5);
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.accentStrong,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarPosition: expanded ? "left" : "bottom",
        tabBarVariant: expanded ? "material" : "uikit",
        tabBarLabelPosition: "below-icon",
        tabBarItemStyle: { minHeight: MIN_TOUCH_TARGET, paddingVertical: 2, paddingHorizontal: 0 },
        tabBarIconStyle: { height: 26, width: 56 },
        tabBarStyle: expanded ? {
          backgroundColor: palette.tabBar,
          borderRightWidth: 1,
          borderRightColor: ink,
          width: 100,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 12,
        } : {
          backgroundColor: palette.tabBar,
          borderTopColor: ink,
          borderTopWidth: 1,
          height: barHeight + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom + 4,
        },
        tabBarLabel: ({ color, children }) => (
          <Text numberOfLines={1} maxFontSizeMultiplier={LABEL_MAX_SCALE} style={{ color: String(color), fontFamily: fonts.monoSemibold, fontSize: 12, lineHeight: 16, textAlign: "center", marginTop: 2, textTransform: "uppercase" }}>{children}</Text>
        ),
        tabBarIcon: ({ color, focused }) => (
          <View style={{ width: 56, height: 26, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", backgroundColor: focused ? palette.accentSoft : "transparent" }}>
            <Icon name={icons[route.name][focused ? 1 : 0]} size={21} color={String(color)} />
          </View>
        ),
      })}
    >
      <Tabs.Screen name="today" options={{ title: t("tabs.today") }} />
      <Tabs.Screen name="log" options={{ title: t("tabs.log") }} />
      <Tabs.Screen name="programs" options={{ title: t("tabs.programs") }} />
      <Tabs.Screen name="progress" options={{ title: t("tabs.progress") }} />
      <Tabs.Screen name="profile" options={{ title: t("tabs.profile") }} />
    </Tabs>
  );
}
