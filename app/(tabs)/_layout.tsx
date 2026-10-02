import { Tabs } from "expo-router";
import { PixelRatio, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppInsets } from "../../src/shared/layout/useAppInsets";
import { Icon, IconName } from "../../src/shared/components/Icon";
import { Text } from "../../src/shared/components/Text";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { fonts } from "../../src/shared/theme/typography";
import { MIN_TOUCH_TARGET, radii } from "../../src/shared/theme/tokens";
import { MAX_FONT_SCALE } from "../../src/shared/theme/scale";

const icons: Record<string, [IconName, IconName]> = {
  today: ["sunny-outline", "sunny"],
  log: ["calendar-clear-outline", "calendar-clear"],
  progress: ["trending-up-outline", "trending-up"],
  programs: ["barbell-outline", "barbell"],
  profile: ["person-circle-outline", "person-circle"],
};

export default function TabLayout() {
  const { palette, layoutScale: scale } = useTheme();
  const { t } = useTranslation();
  const insets = useAppInsets();
  const expanded = useWindowDimensions().width >= 768;
  // Labels follow the system font size (up to the app-wide cap), so the bar grows with them.
  const labelScale = Math.min(PixelRatio.getFontScale(), MAX_FONT_SCALE);
  const barHeight = Math.max(76, Math.round(84 * scale)) + Math.round(16 * scale * (labelScale - 1) * 2.5);
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.accentStrong,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarPosition: expanded ? "left" : "bottom",
        tabBarVariant: expanded ? "material" : "uikit",
        tabBarLabelPosition: "below-icon",
        tabBarItemStyle: { minHeight: MIN_TOUCH_TARGET, paddingVertical: 4 },
        tabBarIconStyle: { height: 30, width: 56 },
        tabBarStyle: expanded ? {
          backgroundColor: palette.tabBar,
          borderRightWidth: 1,
          borderRightColor: palette.border,
          width: 100,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 12,
        } : {
          backgroundColor: palette.tabBar,
          borderTopColor: palette.border,
          height: barHeight + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        },
        tabBarLabel: ({ color, children }) => (
          <Text numberOfLines={1} style={{ color: String(color), fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, textAlign: "center", marginTop: 3 }}>{children}</Text>
        ),
        tabBarIcon: ({ color, focused }) => (
          <View style={{ width: 56, height: 30, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", backgroundColor: focused ? palette.accentSoft : "transparent" }}>
            <Icon name={icons[route.name][focused ? 1 : 0]} size={23} color={String(color)} />
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
