import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { getProgressSnapshot } from "../../src/features/analytics/repository";
import type { PersonalBest } from "../../src/features/analytics/summary";
import { getGoalSnapshot, GoalSnapshot } from "../../src/features/goals/repository";
import { ActiveWorkout, getActiveWorkout, listRecentWorkouts, WorkoutHistoryItem } from "../../src/features/session/repository";
import { ActionButton, Body, Card, Icon, Label, ListGroup, ListRow, Numeral, Screen, SectionTitle, Text, Title } from "../../src/shared/components/ui";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { fonts } from "../../src/shared/theme/typography";
import { formatBestValue } from "../../src/shared/utils/format";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";

type HomeData = {
  active: ActiveWorkout | null;
  goals: GoalSnapshot | null;
  weekSets: number;
  bests: PersonalBest[];
  last: WorkoutHistoryItem | null;
};

export default function TodayScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [data, setData] = useState<HomeData>({ active: null, goals: null, weekSets: 0, bests: [], last: null });

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void Promise.all([getActiveWorkout(), getGoalSnapshot(), getProgressSnapshot(), listRecentWorkouts(1)]).then(([active, goals, progress, recent]) => {
      if (!mounted) return;
      const bests = [...progress.personalBests].sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime()).slice(0, 3);
      setData({ active, goals, weekSets: progress.weekSets, bests, last: recent[0] ?? null });
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []));

  const now = new Date();
  const hour = now.getHours();
  const greeting = t(hour < 12 ? "home.morning" : hour < 18 ? "home.afternoon" : "home.evening");
  const dateText = now.toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
  const dateLabel = dateText.charAt(0).toUpperCase() + dateText.slice(1);
  const week = data.goals?.activeDays.slice(-7) ?? [];
  const todayIndex = (now.getDay() + 6) % 7;
  const { active, goals } = data;
  const activeMinutes = active ? Math.max(0, Math.round((now.getTime() - active.startedAt.getTime()) / 60000)) : 0;

  return (
    <Screen>
      <View style={styles.topline}>
        <Label style={styles.date}>{dateLabel}</Label>
        {goals && goals.currentStreak > 0 ? (
          <View style={[styles.streakPill, { backgroundColor: palette.recordSoft }]}>
            <Icon name="flame" size={15} color={palette.record} />
            <Text style={[styles.streakText, { color: palette.record }]}>{goals.currentStreak}</Text>
          </View>
        ) : null}
      </View>
      <Title style={styles.greeting}>{greeting}</Title>

      <View style={[styles.hero, { backgroundColor: palette.hero }]}>
        <View style={styles.heroCopy}>
          <Text style={[styles.heroTitle, { color: palette.heroText }]}>{active ? t("home.inProgress") : t("home.startTitle")}</Text>
          <Text style={[styles.heroBody, { color: palette.heroText }]}>
            {active ? `${active.name} · ${t("home.startedAgo", { minutes: activeMinutes, count: active.exercises.length })}` : t("home.startBody")}
          </Text>
        </View>
        <ActionButton
          variant="inverse"
          label={active ? t("home.resume") : t("home.startEmpty")}
          icon={active ? "play" : "add"}
          onPress={() => router.push({ pathname: "/workout/[id]", params: { id: active?.id ?? "new" } })}
        />
        {active ? null : (
          <Text accessibilityRole="button" onPress={() => router.push("/programs")} style={[styles.heroLink, { color: palette.heroText }]}>
            {t("home.choosePlan")}
          </Text>
        )}
      </View>

      <Card style={styles.weekCard}>
        <View style={styles.weekHeader}>
          <View>
            <Label>{t("home.weekTitle")}</Label>
            <View style={styles.weekCount}>
              <Numeral>{goals?.thisWeekSessions ?? 0}</Numeral>
              <Body>{t("home.ofTarget", { target: goals?.weeklyTarget ?? 3 })}</Body>
            </View>
          </View>
          <Icon name="calendar-outline" size={20} color={palette.textMuted} />
        </View>
        <View style={styles.days}>
          {week.map((day, index) => {
            const trained = day.count > 0;
            const isToday = index === todayIndex;
            const initial = new Date(`${day.date}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "narrow" });
            return (
              <View key={day.date} style={styles.day}>
                <View style={[
                  styles.dayDot,
                  { backgroundColor: trained ? palette.accent : palette.surfaceMuted, borderColor: isToday ? palette.accentStrong : "transparent" },
                ]}>
                  {trained ? <Icon name="checkmark" size={16} color={palette.accentText} /> : null}
                </View>
                <Text style={[styles.dayLabel, { color: isToday ? palette.text : palette.textMuted }]}>{initial}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <View style={styles.stats}>
        <Stat value={data.weekSets} label={t("home.setsWeek")} />
        <Stat value={goals?.currentStreak ?? 0} label={t("home.streak")} />
        <Stat value={goals?.totalSessions ?? 0} label={t("home.total")} />
      </View>

      {data.bests.length > 0 ? (
        <>
          <SectionTitle title={t("home.recentBests")} action={<Text onPress={() => router.push("/(tabs)/progress")} style={[styles.link, { color: palette.accentStrong }]}>{t("home.seeProgress")}</Text>} />
          <ListGroup>
            {data.bests.map((best) => (
              <ListRow
                key={`${best.exerciseId}-${best.kind}`}
                icon="trophy"
                tint={palette.record}
                title={best.exerciseName}
                subtitle={best.achievedAt.toLocaleDateString(i18n.language, { day: "numeric", month: "short" })}
                trailing={<Text style={[styles.bestValue, { color: palette.text }]}>{formatBestValue(best)}</Text>}
              />
            ))}
          </ListGroup>
        </>
      ) : null}

      <SectionTitle title={t("home.quick")} />
      <ListGroup>
        <ListRow icon="flash-outline" title={t("home.micro")} subtitle={t("home.microBody")} onPress={() => router.push("/micro-session")} />
        <ListRow icon="body-outline" title={t("home.mobility")} subtitle={t("home.mobilityBody")} onPress={() => router.push("/mobility")} />
        <ListRow icon="scale-outline" title={t("home.bodyweight")} subtitle={t("home.bodyweightBody")} onPress={() => router.push("/bodyweight")} />
        {data.last ? (
          <ListRow
            icon="time-outline"
            title={t("home.lastWorkout")}
            subtitle={t("home.lastWorkoutBody", { date: data.last.startedAt.toLocaleDateString(i18n.language, { weekday: "short", day: "numeric", month: "short" }), count: data.last.setCount })}
            onPress={() => router.push({ pathname: "/workout/history/[id]", params: { id: data.last!.id } })}
          />
        ) : null}
      </ListGroup>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Numeral style={styles.statValue}>{value}</Numeral>
      <Label>{label}</Label>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  topline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { fontSize: 14 },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, height: 30, borderRadius: 999 },
  streakText: { fontFamily: fonts.display, fontSize: 17 },
  greeting: { marginTop: -8, fontSize: 44, lineHeight: 46 },
  hero: { borderRadius: 26, padding: 22, gap: 16 },
  heroCopy: { gap: 8 },
  heroTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32 },
  heroBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, opacity: 0.88 },
  heroLink: { fontFamily: fonts.semibold, fontSize: 15, textAlign: "center", textDecorationLine: "underline", paddingVertical: 2 },
  weekCard: { gap: 16 },
  weekHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  weekCount: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 2 },
  days: { flexDirection: "row", justifyContent: "space-between" },
  day: { alignItems: "center", gap: 6 },
  dayDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dayLabel: { fontFamily: fonts.semibold, fontSize: 12, textTransform: "capitalize" },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 14, paddingHorizontal: 14, gap: 2 },
  statValue: { fontSize: 36, lineHeight: 40 },
  link: { fontFamily: fonts.semibold, fontSize: 14 },
  bestValue: { fontFamily: fonts.display, fontSize: 22 },
});
