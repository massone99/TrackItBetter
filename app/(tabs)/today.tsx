import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { getProgressSnapshot } from "../../src/features/analytics/repository";
import { estimateSessionSeconds, programsByRecentUse, sessionSetCount, type UserProgram, type UserProgramSession } from "../../src/domain/userProgram";
import { startUserProgramSession } from "../../src/features/programs/startUserSession";
import { listUserPrograms } from "../../src/features/programs/userPrograms";
import { listExercises } from "../../src/features/exercises/repository";
import type { PersonalBest } from "../../src/features/analytics/summary";
import { getGoalSnapshot, GoalSnapshot } from "../../src/features/goals/repository";
import { ActiveWorkout, getActiveWorkout, listRecentWorkoutNames, listRecentWorkouts, repeatWorkout, WorkoutHistoryItem } from "../../src/features/session/repository";
import { readDefaultRest } from "../../src/features/session/restDefaults";
import { ActionButton, Card, EmptyState, Icon, Label, ListGroup, ListRow, Screen, SectionTitle, Text, Title } from "../../src/shared/components/ui";
import { poseDetectionAvailable } from "../../src/features/pose/detectPose";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { fonts } from "../../src/shared/theme/typography";
import { radii } from "../../src/shared/theme/tokens";
import { formatBestValue, formatMinutes } from "../../src/shared/utils/format";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";
import { openExercisePage } from "../../src/features/exercises/openExercise";

type Planned = { program: UserProgram; session: UserProgramSession; seconds: number };

type HomeData = {
  active: ActiveWorkout | null;
  goals: GoalSnapshot | null;
  /** The newest personal best, only when it was set this week. */
  weekBest: PersonalBest | null;
  last: WorkoutHistoryItem | null;
  /** Next workout of each program, the one trained most recently first. */
  planned: Planned[];
};

/** Midnight of this week's Monday. */
function startOfWeek(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

async function loadHome(): Promise<HomeData> {
  const [active, goals, progress, recent, programs, names, exercises] = await Promise.all([
    getActiveWorkout(), getGoalSnapshot(), getProgressSnapshot(), listRecentWorkouts(1), listUserPrograms(), listRecentWorkoutNames(), listExercises(),
  ]);
  const metricById = new Map(exercises.map((exercise) => [exercise.id, exercise.metric]));
  const rest = readDefaultRest("working");
  const weekStart = startOfWeek(new Date()).getTime();
  const newest = [...progress.personalBests].sort((a, b) => b.achievedAt.getTime() - a.achievedAt.getTime())[0];
  return {
    active,
    goals,
    weekBest: newest && newest.achievedAt.getTime() >= weekStart ? newest : null,
    last: recent[0] ?? null,
    planned: programsByRecentUse(programs, names).map((item) => ({ ...item, seconds: estimateSessionSeconds(item.session, metricById, rest) })),
  };
}

export default function TodayScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  // Refocusing keeps the previous data on screen while the new one loads, so nothing flashes.
  useFocusEffect(useCallback(() => {
    let mounted = true;
    loadHome().then(
      (next) => { if (mounted) { setData(next); setFailed(false); } },
      () => { if (mounted) setFailed(true); },
    );
    return () => { mounted = false; };
  }, []));
  const retry = () => loadHome().then((next) => { setData(next); setFailed(false); }, () => setFailed(true));

  const now = new Date();
  const hour = now.getHours();
  const greeting = t(hour < 12 ? "home.morning" : hour < 18 ? "home.afternoon" : "home.evening");
  const dateText = now.toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long" });
  const dateLabel = dateText.charAt(0).toUpperCase() + dateText.slice(1);

  const startPlanned = async ({ program, session }: Planned) => {
    if (starting) return;
    setStarting(session.id);
    try {
      const workoutId = await startUserProgramSession(program, session);
      router.push({ pathname: "/workout/[id]", params: { id: workoutId } });
    } catch {
      router.push({ pathname: "/program/user/[id]", params: { id: program.id } });
    } finally {
      setStarting(null);
    }
  };
  const startEmpty = () => router.push({ pathname: "/workout/[id]", params: { id: data?.active?.id ?? "new" } });

  const header = (
    <>
      <View style={styles.topline}>
        <Label style={styles.date}>{dateLabel}</Label>
        {data?.goals && data.goals.currentStreak > 0 ? (
          <View accessible accessibilityLabel={t("home.streakLabel", { count: data.goals.currentStreak })} style={[styles.streakPill, { backgroundColor: palette.recordSoft }]}>
            <Icon name="flame" size={15} color={palette.record} />
            <Text style={[styles.streakText, { color: palette.record }]}>{data.goals.currentStreak}</Text>
          </View>
        ) : null}
      </View>
      <Title style={styles.greeting}>{greeting}</Title>
    </>
  );

  if (failed && !data) {
    return (
      <Screen>
        {header}
        <EmptyState icon="alert-circle-outline" title={t("home.loadError")} body={t("home.loadErrorBody")} action={<ActionButton icon="refresh" label={t("home.retry")} onPress={() => void retry()} />} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <Screen>
        {header}
        <View accessible accessibilityLabel={t("home.loading")} style={[styles.hero, styles.heroPlaceholder, { backgroundColor: palette.surfaceMuted }]} />
      </Screen>
    );
  }

  const { active, goals, planned, last, weekBest } = data;
  const [featured, ...others] = active ? [] : planned;
  const activeMinutes = active ? Math.max(0, Math.round((now.getTime() - active.startedAt.getTime()) / 60000)) : 0;
  const weeklyTarget = goals?.weeklyTarget ?? 3;
  const weeklySessions = goals?.thisWeekSessions ?? 0;
  const goalReached = weeklySessions >= weeklyTarget;
  const week = goals?.activeDays.slice(-7) ?? [];
  const todayIndex = (now.getDay() + 6) % 7;

  return (
    <Screen>
      {header}

      {/* One primary action: resume, the next planned workout, or a new one. */}
      <View style={[styles.hero, { backgroundColor: palette.hero }]}>
        <View style={styles.heroCopy}>
          {active ? (
            <>
              <Text style={[styles.heroEyebrow, { color: palette.heroText }]}>{t("home.inProgress")}</Text>
              <Text style={[styles.heroTitle, { color: palette.heroText }]}>{active.name}</Text>
              <Text style={[styles.heroBody, { color: palette.heroText }]}>{t("home.startedAgo", { minutes: activeMinutes, count: active.exercises.length })}</Text>
            </>
          ) : featured ? (
            <>
              <Text style={[styles.heroEyebrow, { color: palette.heroText }]}>{t("home.upNext", { program: featured.program.name })}</Text>
              <Text style={[styles.heroTitle, { color: palette.heroText }]}>{featured.session.name}</Text>
              <Text style={[styles.heroBody, { color: palette.heroText }]}>
                {t("home.sessionMeta", { count: featured.session.exercises.length, sets: sessionSetCount(featured.session), minutes: formatMinutes(featured.seconds) })}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.heroTitle, { color: palette.heroText }]}>{t("home.startTitle")}</Text>
              <Text style={[styles.heroBody, { color: palette.heroText }]}>{t("home.startBody")}</Text>
            </>
          )}
        </View>
        {active ? (
          <ActionButton variant="inverse" icon="play" label={t("home.resume")} onPress={startEmpty} />
        ) : featured ? (
          <ActionButton
            variant="inverse"
            icon="play"
            label={starting === featured.session.id ? t("programBuilder.starting") : t("userProgram.start")}
            disabled={starting !== null}
            onPress={() => void startPlanned(featured)}
          />
        ) : (
          <ActionButton variant="inverse" icon="add" label={t("home.startEmpty")} onPress={startEmpty} />
        )}
        {active ? null : (
          <Pressable
            accessibilityRole="button"
            onPress={featured ? startEmpty : () => router.push("/programs")}
            style={styles.heroLinkRow}
          >
            <Text style={[styles.heroLink, { color: palette.heroText }]}>{featured ? t("home.emptyWorkout") : t("home.choosePlan")}</Text>
            <Icon name={featured ? "add" : "arrow-forward"} size={18} color={palette.heroText} />
          </Pressable>
        )}
      </View>

      {others.length > 0 ? (
        <ListGroup>
          {others.map((item) => (
            <ListRow
              key={item.program.id}
              icon="barbell-outline"
              title={t("userProgram.nextShort", { name: item.session.name })}
              subtitle={item.program.name}
              onPress={() => router.push({ pathname: "/program/user/[id]", params: { id: item.program.id } })}
            />
          ))}
        </ListGroup>
      ) : null}

      <Card style={styles.weekCard}>
        <View style={styles.weekHeader}>
          <Label style={styles.weekTitle}>{t("home.weekTitle")}</Label>
          <View style={styles.weekCount}>
            {goalReached ? <Icon name="checkmark-circle" size={18} color={palette.success} /> : null}
            <Text style={[styles.weekCountText, { color: goalReached ? palette.success : palette.text }]}>{t("home.weekCount", { count: weeklySessions, target: weeklyTarget })}</Text>
          </View>
        </View>
        <View style={styles.days}>
          {week.map((day, index) => {
            const trained = day.count > 0;
            const isToday = index === todayIndex;
            const date = new Date(`${day.date}T12:00:00`);
            return (
              <View
                key={day.date}
                accessible
                accessibilityLabel={`${date.toLocaleDateString(i18n.language, { weekday: "long" })}: ${trained ? t("home.dayTrained") : t("home.dayRest")}`}
                style={styles.day}
              >
                <View style={[styles.dayDot, { backgroundColor: trained ? palette.accent : palette.surfaceMuted, borderColor: isToday ? palette.accentStrong : "transparent" }]}>
                  {trained ? <Icon name="checkmark" size={16} color={palette.accentText} /> : null}
                </View>
                <Text style={[styles.dayLabel, { color: isToday ? palette.text : palette.textMuted }]}>{date.toLocaleDateString(i18n.language, { weekday: "narrow" })}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      {weekBest ? (
        <ListGroup>
          <ListRow
            icon="trophy"
            tint={palette.record}
            title={weekBest.exerciseName}
            subtitle={t("home.weekBest")}
            onLongPress={() => openExercisePage(weekBest.exerciseId)}
            longPressLabel={t("logger.openExercise")}
            trailing={<Text style={[styles.bestValue, { color: palette.text }]}>{formatBestValue(weekBest)}</Text>}
          />
        </ListGroup>
      ) : null}

      <SectionTitle title={t("home.quick")} />
      <ListGroup>
        {last && !active ? (
          <ListRow
            icon="repeat"
            title={t("home.repeatLast")}
            subtitle={t("home.repeatLastBody", { name: last.name, date: last.startedAt.toLocaleDateString(i18n.language, { weekday: "short", day: "numeric", month: "short" }) })}
            onPress={() => void repeatWorkout(last.id).then((workoutId) => router.push({ pathname: "/workout/[id]", params: { id: workoutId } })).catch(() => undefined)}
          />
        ) : null}
        <ListRow icon="flash-outline" title={t("home.micro")} subtitle={t("home.microBody")} onPress={() => router.push("/micro-session")} />
        <ListRow icon="scale-outline" title={t("home.bodyweight")} subtitle={t("home.bodyweightBody")} onPress={() => router.push("/bodyweight")} />
        <ListRow icon="body-outline" title={t("home.mobility")} subtitle={t("home.mobilityBody")} onPress={() => router.push("/mobility")} />
        {poseDetectionAvailable ? (
          <ListRow icon="scan-outline" title={t("home.pose")} subtitle={t("home.poseBody")} onPress={() => router.push({ pathname: "/pose/new", params: { positionId: "free" } })} />
        ) : null}
      </ListGroup>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  topline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  date: { flex: 1, fontSize: 14 },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, minHeight: 32, paddingVertical: 4, borderRadius: radii.pill },
  streakText: { fontFamily: fonts.display, fontSize: 17 },
  greeting: { marginTop: -8, fontSize: 32, lineHeight: 36 },
  hero: { borderRadius: radii.surface, padding: 20, gap: 16 },
  heroPlaceholder: { minHeight: 220 },
  heroCopy: { gap: 4 },
  heroEyebrow: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, opacity: 0.88 },
  heroTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36 },
  heroBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, opacity: 0.88 },
  heroLinkRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, minHeight: 48 },
  heroLink: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, textAlign: "center" },
  weekCard: { gap: 16 },
  weekHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 },
  weekTitle: { fontSize: 14 },
  weekCount: { flexDirection: "row", alignItems: "center", gap: 4 },
  weekCountText: { fontFamily: fonts.semibold, fontSize: 15 },
  days: { flexDirection: "row", justifyContent: "space-between" },
  day: { alignItems: "center", gap: 6 },
  dayDot: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  dayLabel: { fontFamily: fonts.semibold, fontSize: 12, textTransform: "capitalize" },
  bestValue: { fontFamily: fonts.display, fontSize: 22 },
});
