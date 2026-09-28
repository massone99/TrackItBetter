import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, IconName } from "../../src/shared/components/Icon";
import { Text } from "../../src/shared/components/Text";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { fonts } from "../../src/shared/theme/typography";

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
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.accentStrong,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.tabBar,
          borderTopColor: palette.border,
          height: Math.round(62 * scale) + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
        tabBarLabel: ({ color, children }) => (
          <Text style={{ color: String(color), fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, marginTop: 2 }}>{children}</Text>
        ),
        tabBarIcon: ({ color, focused }) => <Icon name={icons[route.name][focused ? 1 : 0]} size={23} color={String(color)} />,
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
