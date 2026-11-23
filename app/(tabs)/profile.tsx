import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { Icon, Label, ListGroup, ListRow, PageHeading, Screen, Text } from "../../src/shared/components/ui";
import { fonts } from "../../src/shared/theme/typography";
import { getGoalSnapshot } from "../../src/features/goals/repository";
import { loadReminderSettings } from "../../src/features/reminders/notifications";
import { readDefaultRest } from "../../src/features/session/restDefaults";
import { readBooleanPreference, RPE_PROMPT_KEY } from "../../src/shared/settings/preferences";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";
import { spacing } from "../../src/shared/theme/tokens";

/** You: a short index of four groups, each row showing its current value. The settings live one tap away. */
export default function ProfileScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { preference, scale, palette } = useTheme();
  const [weekly, setWeekly] = useState<number | null>(null);
  const [reminders, setReminders] = useState<boolean | null>(null);
  const [defaults, setDefaults] = useState(() => ({ rest: readDefaultRest("working"), rpe: readBooleanPreference(RPE_PROMPT_KEY, true) }));
  useFocusEffect(useCallback(() => {
    let active = true;
    getGoalSnapshot().then((goals) => { if (active) setWeekly(goals.weeklyTarget); }, () => undefined);
    loadReminderSettings().then((settings) => { if (active) setReminders(settings.enabled); }, () => undefined);
    setDefaults({ rest: readDefaultRest("working"), rpe: readBooleanPreference(RPE_PROMPT_KEY, true) });
    return () => { active = false; };
  }, []));
  const theme = t(preference === "light" ? "profile.light" : preference === "dark" ? "profile.dark" : "profile.system");
  return (
    <Screen>
      <PageHeading title={t("tabs.profile")} />

      <View style={styles.group}>
        <Label>{t("profile.training")}</Label>
        <ListGroup>
          <ListRow icon="flag-outline" title={t("simple.goals")} value={weekly !== null ? t("simple.perWeek", { count: weekly }) : undefined} onPress={() => router.push("/goals")} />
          <ListRow icon="notifications-outline" title={t("simple.reminders")} value={reminders !== null ? t(reminders ? "workout.menuOn" : "workout.menuOff") : undefined} onPress={() => router.push("/reminders")} />
          <ListRow icon="barbell-outline" title={t("profile.equipment")} value={t("simple.equipmentValue")} onPress={() => router.push("/equipment")} />
          <ListRow icon="timer-outline" title={t("simple.workoutDefaults")} value={t("simple.defaultsValue", { seconds: defaults.rest, rpe: t(defaults.rpe ? "workout.menuOn" : "workout.menuOff") })} onPress={() => router.push("/settings/training")} />
          <ListRow icon="book-outline" title={t("principles.title")} onPress={() => router.push("/principles")} />
        </ListGroup>
      </View>

      <View style={styles.group}>
        <Label>{t("profile.body")}</Label>
        <ListGroup>
          <ListRow icon="scale-outline" title={t("profile.bodyweight")} onPress={() => router.push("/bodyweight")} />
          <ListRow icon="images-outline" title={t("profile.photos")} onPress={() => router.push("/photos")} />
          <ListRow icon="resize-outline" title={t("profile.measurements")} onPress={() => router.push("/measurements")} />
          <ListRow icon="body-outline" title={t("profile.mobility")} onPress={() => router.push("/mobility")} />
        </ListGroup>
      </View>

      <View style={styles.group}>
        <Label>{t("simple.app")}</Label>
        <ListGroup>
          <ListRow icon="text-outline" title={t("simple.appearance")} value={`${theme} · ${Math.round(scale * 100)} %`} onPress={() => router.push("/settings/appearance")} />
          <ListRow icon="cloud-download-outline" title={t("simple.backup")} onPress={() => router.push("/data")} />
        </ListGroup>
      </View>

      <View style={styles.about}>
        <Icon name="shield-checkmark-outline" size={16} color={palette.success} />
        <Text style={[styles.aboutText, { color: palette.textMuted }]}>{t("simple.local")}</Text>
      </View>
      {/* The installed version, to tell which release is on the phone. */}
      {config?.version ? <Text selectable style={[styles.version, { color: palette.textMuted }]}>{config.android?.versionCode ? t("profile.version", { version: config.version, build: config.android.versionCode }) : t("profile.versionShort", { version: config.version })}</Text> : null}
    </Screen>
  );
}

const config = Constants.expoConfig;

const baseStyles = StyleSheet.create({
  group: { gap: spacing.sm },
  about: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  aboutText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  version: { fontFamily: fonts.medium, fontSize: 13 },
});
