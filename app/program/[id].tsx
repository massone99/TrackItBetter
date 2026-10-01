import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { Text } from "../../src/shared/components/Text";
import { WorkoutInProgressSheet } from "../../src/features/session/WorkoutInProgressSheet";
import { addExerciseToWorkout, addSet, getActiveWorkout, startWorkout, updateSet } from "../../src/features/session/repository";
import { findProgram, ProgramExercise } from "../../src/features/programs/catalog";
import { ActionButton, Body, Card, Heading, Label, PageHeading, Screen, SectionTitle } from "../../src/shared/components/ui";
import i18n from "../../src/shared/i18n";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";

export default function ProgramRoute() {
  const styles = useScaledStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const program = findProgram(id);
  const { palette } = useTheme();
  const [startingSession, setStartingSession] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const language = i18n.language.startsWith("it") ? "it" : "en";

  if (!program) {
    return <Screen><PageHeading title={language === "it" ? "Routine non trovata" : "Routine not found"} subtitle={language === "it" ? "Scegli una routine dalla raccolta." : "Choose a routine from the collection."} /><ActionButton label={language === "it" ? "Tutte le routine" : "All routines"} onPress={() => router.replace("/programs")} /></Screen>;
  }

  const startSession = async (sessionId: string, sessionName: string, exercises: ProgramExercise[]) => {
    if (startingSession) return;
    setStartingSession(sessionId);
    try {
      const open = await getActiveWorkout();
      if (open) { setBlockedBy({ id: open.id, name: open.name }); return; }
      const workoutId = await startWorkout(sessionName);
      const entries = [] as { entryId: string; prescription: ProgramExercise }[];
      for (const prescription of exercises) {
        entries.push({ entryId: await addExerciseToWorkout(workoutId, prescription.exerciseId), prescription });
      }
      const active = await getActiveWorkout(workoutId);
      for (const { entryId, prescription } of entries) {
        const metric = active?.exercises.find((exercise) => exercise.entryId === entryId)?.metric;
        const timed = metric === "time" || metric === "time_load";
        const setIds = active?.exercises.find((exercise) => exercise.entryId === entryId)?.sets.map((set) => set.id) ?? [];
        while (setIds.length < prescription.sets) setIds.push(await addSet(entryId));
        for (const setId of setIds.slice(0, prescription.sets)) {
          await updateSet(setId, "restSec", prescription.restSeconds);
          if (timed && prescription.target.seconds !== undefined) await updateSet(setId, "durationSec", prescription.target.seconds);
          if (!timed && prescription.target.reps !== undefined) await updateSet(setId, "reps", prescription.target.reps);
        }
      }
      router.replace({ pathname: "/workout/[id]", params: { id: workoutId } });
    } catch (error) {
      Alert.alert(
        language === "it" ? "Impossibile avviare la sessione" : "Could not start session",
        error instanceof Error ? error.message : language === "it" ? "Riprova." : "Please try again.",
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
        <Label style={{ color: palette.accentStrong }}>{language === "it" ? "Panoramica" : "Overview"}</Label>
        <Body style={{ color: palette.text }}>{program.details[language]}</Body>
      </Card>
      <SectionTitle title={language === "it" ? "La tua settimana" : "Your week"} />
      {program.sessions.map((session) => (
        <Card key={session.id} style={styles.session}>
          <View style={styles.sessionHead}>
            <View style={styles.sessionTitle}><Label>{session.day[language]}</Label><Heading>{session.name[language]}</Heading></View>
            <Label>{session.exercises.length} {language === "it" ? "esercizi" : "exercises"}</Label>
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
              ? language === "it" ? "Preparazione…" : "Preparing…"
              : language === "it" ? "Avvia sessione" : "Start session"}
            onPress={() => void startSession(session.id, session.name[language], session.exercises)}
          />
          {startingSession === session.id && <ActivityIndicator color={palette.accentStrong} />}
        </Card>
      ))}
      <Body style={styles.footnote}>{language === "it"
        ? "Le serie e le ripetizioni sono obiettivi iniziali: puoi modificarli nel registro. Lascia i giorni di recupero secondo le tue esigenze."
        : "Sets and reps are starting targets you can edit in the logger. Place rest days where they suit your recovery."}</Body>
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
