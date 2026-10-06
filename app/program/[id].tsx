import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { Text } from "../../src/shared/components/Text";
import { WorkoutInProgressSheet } from "../../src/features/session/WorkoutInProgressSheet";
import { getActiveWorkout } from "../../src/features/session/repository";
import { startPrescribedWorkout } from "../../src/features/programs/startUserSession";
import { findProgram, ProgramExercise } from "../../src/features/programs/catalog";
import { ActionButton, Body, Card, Heading, Label, PageHeading, Screen, SectionTitle } from "../../src/shared/components/ui";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";

export default function ProgramRoute() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const program = findProgram(id);
  const { palette } = useTheme();
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith("it") ? "it" : "en";

  if (!program) {
    return <Screen><PageHeading title={t("templateProgram.notFound")} subtitle={t("templateProgram.notFoundBody")} /><ActionButton label={t("templateProgram.all")} onPress={() => router.replace("/programs")} /></Screen>;
  }

  const startSession = async (sessionId: string, sessionName: string, exercises: ProgramExercise[]) => {
    if (startingSession) return;
    setStartingSession(sessionId);
    try {
      const open = await getActiveWorkout();
      if (open) { setBlockedBy({ id: open.id, name: open.name }); return; }
      // Shared with self-made programs: a failure part-way deletes the half-built workout.
      const workoutId = await startPrescribedWorkout(sessionName, exercises.map((prescription, index) => ({
        id: `${sessionId}-${index}`,
        exerciseId: prescription.exerciseId,
        sets: prescription.sets,
        target: prescription.target.seconds ?? prescription.target.reps ?? null,
        restSeconds: prescription.restSeconds,
      })));
      router.replace({ pathname: "/workout/[id]", params: { id: workoutId } });
    } catch (error) {
      Alert.alert(
        t("templateProgram.startError"),
        error instanceof Error ? error.message : t("common.tryAgain"),
      );
    } finally {
      setStartingSession(null);
    }
  };

  return (
    <Screen>
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
      <PageHeading title={program.name[language]} subtitle={program.frequency[language]} />
      <Card style={[styles.intro, { backgroundColor: palette.surfaceMuted, borderColor: palette.surfaceMuted }]}>
        <Label style={{ color: palette.accentStrong }}>{t("templateProgram.overview")}</Label>
        <Body style={{ color: palette.text }}>{program.details[language]}</Body>
      </Card>
      <SectionTitle title={t("templateProgram.week")} />
      {program.sessions.map((session) => (
        <Card key={session.id} style={styles.session}>
          <View style={styles.sessionHead}>
            <View style={styles.sessionTitle}><Label>{session.day[language]}</Label><Heading>{session.name[language]}</Heading></View>
            <Label>{t("templateProgram.exercises", { count: session.exercises.length })}</Label>
          </View>
          {session.exercises.map((prescription) => {
            const exercise = catalogExerciseName(prescription.exerciseId, language);
            const target = prescription.target.reps !== undefined
              ? `${prescription.sets} × ${prescription.target.reps}`
              : `${prescription.sets} × ${prescription.target.seconds}s`;
            return <View key={prescription.exerciseId} style={[styles.exerciseRow, { borderColor: palette.border }]}><Text style={[styles.exerciseName, { color: palette.text }]}>{exercise}</Text><Text style={[styles.target, { color: palette.textMuted }]}>{target}</Text></View>;
          })}
          <ActionButton
            label={startingSession === session.id
              ? t("templateProgram.preparing")
              : t("templateProgram.start")}
            onPress={() => void startSession(session.id, session.name[language], session.exercises)}
          />
          {startingSession === session.id && <ActivityIndicator color={palette.accentStrong} />}
        </Card>
      ))}
      <Body style={styles.footnote}>{t("templateProgram.footnote")}</Body>
    </Screen>
  );
}

const exerciseNames: Record<string, { en: string; it: string }> = {
  "incline-push-up": { en: "Incline push-up", it: "Piegamento inclinato" },
  "inverted-row": { en: "Inverted row", it: "Rematore inverso" },
  "bodyweight-squat": { en: "Bodyweight squat", it: "Squat a corpo libero" },
  plank: { en: "Plank", it: "Plank" },
  "push-up": { en: "Push-up", it: "Piegamento" },
  "band-assisted-pull-up": { en: "Band-assisted pull-up", it: "Trazione assistita con elastico" },
  "reverse-lunge": { en: "Reverse lunge", it: "Affondo indietro" },
  "glute-bridge": { en: "Glute bridge", it: "Ponte glutei" },
  "parallel-bar-dip": { en: "Parallel bar dip", it: "Dip alle parallele" },
  "pike-push-up": { en: "Pike push-up", it: "Piegamento a V" },
  "pull-up": { en: "Pull-up", it: "Trazione" },
  "dead-hang": { en: "Dead hang", it: "Sospensione alla sbarra" },
  "split-squat": { en: "Split squat", it: "Squat diviso" },
  "single-leg-glute-bridge": { en: "Single-leg glute bridge", it: "Ponte glutei a una gamba" },
  "decline-push-up": { en: "Decline push-up", it: "Piegamento declinato" },
  "ring-dip": { en: "Ring dip", it: "Dip agli anelli" },
  "elevated-pike-push-up": { en: "Elevated pike push-up", it: "Piegamento a V rialzato" },
  "chin-up": { en: "Chin-up", it: "Trazione supina" },
  "ring-row": { en: "Ring row", it: "Rematore agli anelli" },
  "hanging-knee-raise": { en: "Hanging knee raise", it: "Sollevamento ginocchia alla sbarra" },
  "assisted-pistol-squat": { en: "Assisted pistol squat", it: "Pistol squat assistito" },
  "hamstring-walkout": { en: "Hamstring walkout", it: "Camminata dei femorali" },
  "wall-facing-handstand-hold": { en: "Wall-facing handstand hold", it: "Verticale fronte al muro" },
  "pike-push-up-progression": { en: "Pike push-up progression", it: "Progressione piegamento a V" },
  "nordic-hamstring-curl": { en: "Nordic hamstring curl", it: "Nordic curl" },
  "calf-raise": { en: "Single-leg calf raise", it: "Calf raise a una gamba" },
  "hollow-body-hold": { en: "Hollow-body hold", it: "Tenuta hollow" },
  "tuck-front-lever": { en: "Tuck front lever", it: "Front lever raccolto" },
  "hanging-leg-raise": { en: "Hanging leg raise", it: "Sollevamento gambe alla sbarra" },
  "assisted-nordic-curl": { en: "Assisted Nordic curl", it: "Nordic curl assistito" },
  "side-plank": { en: "Side plank", it: "Plank laterale" },
};

function catalogExerciseName(id: string, language: "en" | "it"): string {
  return exerciseNames[id]?.[language] ?? id;
}

const baseStyles = StyleSheet.create({
  intro: { padding: 20 },
  session: { gap: 14 },
  sessionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sessionTitle: { gap: 6, flex: 1 },
  exerciseRow: { minHeight: 52, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 },
  exerciseName: { fontSize: 15, lineHeight: 21, fontWeight: "600", flex: 1 },
  target: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: "600", textAlign: "right" },
  footnote: { marginTop: -7 },
});
