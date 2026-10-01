import { Tabs } from "expo-router";
import { View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppInsets } from "../../src/shared/layout/useAppInsets";
import { Icon, IconName } from "../../src/shared/components/Icon";
import { Text } from "../../src/shared/components/Text";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { fonts } from "../../src/shared/theme/typography";
import { MIN_TOUCH_TARGET, radii } from "../../src/shared/theme/tokens";

const icons: Record<string, [IconName, IconName]> = {
  today: ["sunny-outline", "sunny"],
  log: ["calendar-clear-outline", "calendar-clear"],
  progress: ["trending-up-outline", "trending-up"],
  programs: ["barbell-outline", "barbell"],
  profile: ["person-circle-outline", "person-circle"],
};

export default function TabLayout() {
  const { palette, scale } = useTheme();
  const { t } = useTranslation();
  const insets = useAppInsets();
  const expanded = useWindowDimensions().width >= 768;
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
        tabBarIconStyle: { height: 32, width: 56 },
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
          height: Math.max(72, Math.round(76 * scale)) + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        },
        tabBarLabel: ({ color, children }) => (
          <Text style={{ color: String(color), fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, textAlign: "center", marginTop: 3 }}>{children}</Text>
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
