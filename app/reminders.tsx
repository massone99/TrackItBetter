import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import {
  getReminderPermission,
  loadReminderSettings,
  ReminderPermission,
  ReminderSettings,
  requestReminderPermission,
  saveReminderSettings,
} from "../src/features/reminders/notifications";
import { ActionButton, Body, Card, Heading, Label, PageHeading, Screen } from "../src/shared/components/ui";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { useScaledStyles } from "../src/shared/theme/useScaledStyles";

const weekdays = [
  { value: 1, key: "sun" },
  { value: 2, key: "mon" },
  { value: 3, key: "tue" },
  { value: 4, key: "wed" },
  { value: 5, key: "thu" },
  { value: 6, key: "fri" },
  { value: 7, key: "sat" },
] as const;

export default function RemindersScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [settings, setSettings] = useState<ReminderSettings>({ enabled: false, hour: 18, minute: 0, weekdays: [2, 4, 6] });
  const [permission, setPermission] = useState<ReminderPermission>("undetermined");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    if (Platform.OS === "web") {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [nextSettings, nextPermission] = await Promise.all([loadReminderSettings(), getReminderPermission()]);
      setSettings(nextSettings);
      setPermission(nextPermission);
      setError("");
    } catch {
      setError(t("reminders.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const persist = async (enabled: boolean) => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      let nextPermission = permission;
      if (enabled) {
        nextPermission = await requestReminderPermission();
        setPermission(nextPermission);
        if (nextPermission !== "granted") {
          setError(t(nextPermission === "denied" ? "reminders.permissionDenied" : "reminders.permissionNeeded"));
          return;
        }
        if (settings.weekdays.length === 0) {
          setError(t("reminders.selectDay"));
          return;
        }
      }
      const nextSettings = { ...settings, enabled };
      await saveReminderSettings(nextSettings, t("reminders.notificationTitle"), t("reminders.notificationBody"));
      setSettings(nextSettings);
      setSaved(true);
    } catch {
      setError(t("reminders.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const adjustTime = (field: "hour" | "minute", amount: number) => {
    setSaved(false);
    setSettings((current) => {
      if (field === "hour") return { ...current, hour: (current.hour + amount + 24) % 24 };
      return { ...current, minute: (current.minute + amount + 60) % 60 };
    });
  };

  const toggleDay = (weekday: number) => {
    setSaved(false);
    setSettings((current) => ({
      ...current,
      weekdays: current.weekdays.includes(weekday)
        ? current.weekdays.filter((day) => day !== weekday)
        : [...current.weekdays, weekday].sort(),
    }));
  };

  if (Platform.OS === "web") {
    return <Screen><PageHeading title={t("reminders.title")} subtitle={t("reminders.subtitle")} /><Card><Body>{t("reminders.platformUnavailable")}</Body></Card></Screen>;
  }

  return (
    <Screen>
      <PageHeading title={t("reminders.title")} subtitle={t("reminders.subtitle")} />
      <Card>
        <View style={styles.statusRow}>
          <View style={styles.statusText}>
            <Heading>{t(settings.enabled ? "reminders.enabled" : "reminders.disabled")}</Heading>
            <Body>{t(permission === "granted" ? "reminders.permissionGranted" : "reminders.permissionNotGranted")}</Body>
          </View>
          <View style={[styles.statusDot, { backgroundColor: settings.enabled ? palette.accentStrong : palette.border }]} />
        </View>
        {loading ? <Body>{t("reminders.loading")}</Body> : null}
      </Card>

      <Card>
        <Label>{t("reminders.time")}</Label>
        <View style={styles.timeRow}>
          <TimePicker value={settings.hour} onChange={(amount) => adjustTime("hour", amount)} palette={palette} label={t("reminders.hour")} />
          <Heading style={styles.colon}>:</Heading>
          <TimePicker value={settings.minute} onChange={(amount) => adjustTime("minute", amount)} palette={palette} label={t("reminders.minute")} minuteStep />
        </View>
      </Card>

      <Card>
        <Label>{t("reminders.days")}</Label>
        <View style={styles.dayRow}>
          {weekdays.map(({ value, key }) => {
            const selected = settings.weekdays.includes(value);
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={t(`reminders.weekdays.${key}`)}
                accessibilityState={{ selected }}
                onPress={() => toggleDay(value)}
                style={[styles.day, { backgroundColor: selected ? palette.accent : palette.surfaceMuted, borderColor: selected ? palette.accentStrong : palette.border }]}
              >
                <Label style={{ color: selected ? palette.accentText : palette.textMuted, letterSpacing: 0 }}>{t(`reminders.weekdaysShort.${key}`)}</Label>
              </Pressable>
            );
          })}
        </View>
        <Body>{t("reminders.scheduleHint")}</Body>
      </Card>

      {error ? <Body style={{ color: palette.warning }}>{error}</Body> : null}
      {saved ? <Body style={{ color: palette.accentStrong }}>{t("reminders.saved")}</Body> : null}
      {!loading ? <ActionButton label={t(saving ? "reminders.saving" : settings.enabled ? "reminders.save" : "reminders.enable")} onPress={() => void persist(true)} /> : null}
      {!loading && settings.enabled ? <ActionButton label={t("reminders.disable")} secondary onPress={() => void persist(false)} /> : null}
    </Screen>
  );
}

function TimePicker({
  value,
  onChange,
  palette,
  label,
  minuteStep = false,
}: {
  value: number;
  onChange: (amount: number) => void;
  palette: ReturnType<typeof useTheme>["palette"];
  label: string;
  minuteStep?: boolean;
}) {
  const styles = useScaledStyles(baseStyles);
  const formatted = String(value).padStart(2, "0");
  return (
    <View style={styles.timeColumn}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} +`} onPress={() => onChange(minuteStep ? 5 : 1)} style={[styles.stepButton, { backgroundColor: palette.surfaceMuted }]}><Label style={{ color: palette.text }}>＋</Label></Pressable>
      <Heading accessibilityLabel={`${label} ${formatted}`} style={styles.timeValue}>{formatted}</Heading>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label} −`} onPress={() => onChange(minuteStep ? -5 : -1)} style={[styles.stepButton, { backgroundColor: palette.surfaceMuted }]}><Label style={{ color: palette.text }}>−</Label></Pressable>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusText: { flex: 1, gap: 5 },
  statusDot: { width: 13, height: 13, borderRadius: 7, marginLeft: 12 },
  timeRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 13 },
  timeColumn: { alignItems: "center", gap: 8 },
  timeValue: { fontSize: 34, fontVariant: ["tabular-nums"] },
  colon: { marginTop: -3, fontSize: 30 },
  stepButton: { width: 54, height: 37, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  dayRow: { flexDirection: "row", justifyContent: "space-between", gap: 5 },
  day: { width: 39, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1 },
});
