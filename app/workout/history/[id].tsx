import { displayWorkoutName } from "../../../src/features/session/workoutName";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import {
  ExercisePicker,
  type ExerciseChoice,
} from "../../../src/features/exercises/ExercisePicker";
import {
  addExerciseToCompletedWorkout,
  addSetToCompletedWorkout,
  setSetFormRating,
  setSetKind,
  deleteWorkout,
  getCompletedWorkout,
  moveExerciseEntry,
  removeExerciseEntry,
  removeExerciseEntryWithUndo,
  removeSetWithUndo,
  discardRemoved,
  restoreRemoved,
  setCompletedWorkoutSetDone,
  updateCompletedWorkoutDetails,
  updateCompletedWorkoutSet,
  repeatWorkoutIfIdle,
  updateSetRpe,
  WORKOUT_NAME_MAX,
} from "../../../src/features/session/repository";
import { SaveToProgramSheet } from "../../../src/features/programs/SaveToProgramSheet";
import { WorkoutInProgressSheet } from "../../../src/features/session/WorkoutInProgressSheet";
import type {
  CompletedWorkout,
  RemovedRows,
  SessionExercise,
  SessionSet,
} from "../../../src/features/session/repository";
import { ExerciseNoteField } from "../../../src/features/session/ExerciseNoteField";
import { ExerciseAveragesField } from "../../../src/features/session/ExerciseAveragesField";
import { PairEditor } from "../../../src/features/session/PairEditor";
import { SetSheet } from "../../../src/features/session/SetSheet";
import { ExerciseCard } from "../../../src/features/session/ExerciseCard";
import { readBooleanPreference, RPE_PROMPT_KEY } from "../../../src/shared/settings/preferences";
import { getWorkoutMobilitySeconds } from "../../../src/features/analytics/repository";
import { formatMinutes } from "../../../src/shared/utils/format";
import {
  ActionButton,
  Body,
  FooterAction,
  Icon,
  IconButton,
  PageHeading,
  Screen,
  Sheet,
  Stepper,
  tapFeedback,
  Text,
  TextField,
  Toast,
} from "../../../src/shared/components/ui";
import { useTheme } from "../../../src/shared/theme/ThemeProvider";
import { fonts } from "../../../src/shared/theme/typography";
import { useScaledStyles } from "../../../src/shared/theme/useScaledStyles";
import {
  DateField,
  TimeField,
} from "../../../src/shared/components/DateTimePickers";
import { ReorderableList } from "../../../src/shared/components/ReorderableList";
import { goBack } from "../../../src/shared/navigation/goBack";

type SetTarget = { exercise: SessionExercise; set: SessionSet };

export default function PastWorkoutScreen() {
  const styles = useScaledStyles(baseStyles);
  const { id, edit: openDetails } = useLocalSearchParams<{ id: string; edit?: string }>();
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [workout, setWorkout] = useState<CompletedWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobilitySeconds, setMobilitySeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<{ id: string; name: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [setFor, setSetFor] = useState<SetTarget | null>(null);
  const [pairFor, setPairFor] = useState<(SetTarget & { pairedSet: SessionSet | null }) | null>(
    null,
  );
  const [newPairFor, setNewPairFor] = useState<SessionExercise | null>(null);
  const [exerciseFor, setExerciseFor] = useState<SessionExercise | null>(null);
  // A just-created past workout opens on its details, so its day and time are set first.
  const [detailsOpen, setDetailsOpen] = useState(openDetails === "1");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Exercises folded to a one-line summary, to skim a long workout.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const loadedOnce = useRef(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  // The last removal, offered for a few seconds as "Restore".
  const [undo, setUndo] = useState<{ message: string; removed: RemovedRows } | null>(null);
  const [showRpe] = useState(() => readBooleanPreference(RPE_PROMPT_KEY, true));
  // Once the Restore offer is gone, clip files kept for it are deleted (files restored meanwhile stay).
  const hideUndo = useCallback(() => setUndo((current) => {
    if (current) void discardRemoved(current.removed).catch(() => undefined);
    return null;
  }), []);

  const refresh = useCallback(async () => {
    try {
      const [completed, mobility] = await Promise.all([
        getCompletedWorkout(id),
        getWorkoutMobilitySeconds(id),
      ]);
      setWorkout(completed);
      // Like the workout in progress, exercises open folded to their results; tap one to edit it.
      if (completed && !loadedOnce.current) setCollapsed(new Set(completed.exercises.map((item) => item.entryId)));
      if (completed) loadedOnce.current = true;
      setMobilitySeconds(mobility);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Reloads on focus so clips added on the form-check screen show up when returning.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  /** Runs an edit, then reloads; a failure shows one message instead of losing the screen. */
  const edit = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(null);
    } catch {
      setError(t("history.saveError"));
    }
    await refresh();
  };

  const adjust = (
    setId: string,
    field: "reps" | "durationSec" | "distanceM" | "addedLoadKg",
    value: number,
  ) => edit(() => updateCompletedWorkoutSet(id, setId, field, value));

  // A held stepper repeats faster than a save and reload: each step builds on the last value shown,
  // saves in order, and the screen reloads once the steps stop.
  const stepped = useRef(new Map<string, number>());
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const step = (set: SessionSet, field: "reps" | "durationSec" | "distanceM" | "addedLoadKg", delta: number) => {
    const key = `${set.id}:${field}`;
    const stored = field === "addedLoadKg" ? set.addedLoadKg : (set[field] ?? 0);
    const next = Math.round(((stepped.current.get(key) ?? stored) + delta) * 100) / 100;
    const value = field === "addedLoadKg" ? next : Math.max(0, next);
    stepped.current.set(key, value);
    setWorkout((current) => current && {
      ...current,
      exercises: current.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((item) => (item.id === set.id ? { ...item, [field]: value } : item)),
      })),
    });
    writes.current = writes.current.then(() => updateCompletedWorkoutSet(id, set.id, field, value)).catch(() => setError(t("history.saveError")));
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => {
      void writes.current.then(async () => {
        stepped.current.clear();
        await refresh();
      });
    }, 350);
  };

  const chooseExercise = (choice: ExerciseChoice) => {
    setPickerOpen(false);
    void edit(() => addExerciseToCompletedWorkout(id, choice.id));
  };

  const confirmDelete = async () => {
    setDeleteOpen(false);
    try {
      await deleteWorkout(id);
      // Screens below (e.g. the workout summary) still show the deleted workout, so leave them all.
      if (router.canDismiss()) router.dismissAll();
      router.navigate("/(tabs)/log");
    } catch {
      setError(t("history.deleteError"));
    }
  };

  const repeat = () =>
    void repeatWorkoutIfIdle(id)
      .then((result) => {
        if ("workoutId" in result) router.push({ pathname: "/workout/[id]", params: { id: result.workoutId } });
        else setBlockedBy(result.active);
      })
      .catch(() => setError(t("history.repeatError")));

  /** Removes a set at once with a "Restore" toast; a set with clips asks first (from its menu). */
  const removeSet = async (set: SessionSet) => {
    if (set.clipCount > 0) {
      setSetFor(workout ? { exercise: workout.exercises.find((item) => item.sets.some((candidate) => candidate.id === set.id))!, set } : null);
      return;
    }
    await edit(async () => {
      const removed = await removeSetWithUndo(set.id);
      if (removed) setUndo({ message: t("logger.removedSet", { number: set.index }), removed });
    });
  };

  if (loading)
    return (
      <Screen>
        <PageHeading title={t("history.title")} subtitle={t("history.loading")} />
      </Screen>
    );
  if (loadError)
    return (
      <Screen>
        <PageHeading title={t("history.title")} subtitle={t("history.loadError")} />
        <ActionButton
          label={t("history.retry")}
          onPress={() => {
            setLoading(true);
            void refresh();
          }}
        />
        <ActionButton label={t("history.back")} secondary onPress={() => goBack("/(tabs)/log")} />
      </Screen>
    );
  if (!workout)
    return (
      <Screen>
        <PageHeading title={t("history.unavailable")} subtitle={t("history.unavailableBody")} />
        <ActionButton label={t("history.back")} onPress={() => goBack("/(tabs)/log")} />
      </Screen>
    );

  const duration = Math.max(
    0,
    Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000),
  );
  const locale = i18n.language.startsWith("it") ? "it-IT" : "en-US";
  const completedSets = workout.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.completedAt).length,
    0,
  );
  const liveSet = setFor
    ? workout.exercises
        .find((item) => item.entryId === setFor.exercise.entryId)
        ?.sets.find((item) => item.id === setFor.set.id)
    : undefined;

  return (
    <Screen
      footer={
        <>
          <FooterAction icon="add" label={t("workout.addExercise")} secondary onPress={() => setPickerOpen(true)} />
          <FooterAction icon="repeat" label={t("history.repeat")} onPress={repeat} />
        </>
      }
      overlay={
        <Toast
          message={undo?.message ?? null}
          actionLabel={t("logger.restore")}
          onAction={() => {
            const removed = undo?.removed;
            if (removed) void edit(() => restoreRemoved(removed));
          }}
          onHide={hideUndo}
        />
      }
    >
      <PageHeading
        title={displayWorkoutName(workout.name, t("log.pastName"))}
        subtitle={t("history.subtitle", {
          date: workout.startedAt.toLocaleString(locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
          duration,
          unit: t("history.minutes"),
          status: t("history.completed"),
        })}
        action={
          <IconButton
            icon="create-outline"
            tone="accent"
            label={t("history.editDetails")}
            onPress={() => setDetailsOpen(true)}
          />
        }
      />
      {workout.notes ? <Body>{workout.notes}</Body> : null}
      {mobilitySeconds > 0 ? (
        <View style={[styles.mobility, { backgroundColor: palette.accentSoft }]}>
          <Icon name="body-outline" size={16} color={palette.accentStrong} />
          <Text style={[styles.mobilityText, { color: palette.accentStrong }]}>
            {t("mobilityStats.workoutLine", { time: formatMinutes(mobilitySeconds) })}
          </Text>
        </View>
      ) : null}
      <WorkoutInProgressSheet active={blockedBy} onClose={() => setBlockedBy(null)} />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: palette.warning }]}>
          {error}
        </Text>
      ) : null}

      {workout.exercises.length > 1 ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            tapFeedback();
            setCollapsed(
              collapsed.size === workout.exercises.length
                ? new Set()
                : new Set(workout.exercises.map((item) => item.entryId)),
            );
          }}
          style={styles.foldAll}
        >
          <Text style={[styles.foldAllText, { color: palette.accentStrong }]}>
            {collapsed.size === workout.exercises.length
              ? t("common.expandAll")
              : t("common.collapseAll")}
          </Text>
        </Pressable>
      ) : null}

      {/* The same sections and set rows as the workout in progress; done sets stay editable in place. */}
      <ReorderableList
        items={workout.exercises}
        keyOf={(item) => item.entryId}
        nameOf={(item) => item.name}
        gap={20}
        onMove={(from, to) =>
          void edit(() => moveExerciseEntry(id, workout.exercises[from].entryId, to))
        }
        renderRow={(exercise, _index, row) => (
          <ExerciseCard
            handle={row.handle}
            exercise={exercise}
            collapsed={collapsed.has(exercise.entryId)}
            onToggleCollapsed={() => {
              tapFeedback();
              setCollapsed((current) => {
                const next = new Set(current);
                if (!next.delete(exercise.entryId)) next.add(exercise.entryId);
                return next;
              });
            }}
            editDone
            compare={false}
            showRpe={showRpe}
            onChange={async (set, field, delta) => step(set, field, delta)}
            onSetValue={(set, field, value) => void adjust(set.id, field, value)}
            onComplete={(set) => {
              tapFeedback("success");
              void edit(() => setCompletedWorkoutSetDone(id, set.id, true));
            }}
            onUncomplete={(set) => {
              tapFeedback();
              void edit(() => setCompletedWorkoutSetDone(id, set.id, false));
            }}
            onToggleWarmup={(set) => {
              tapFeedback();
              void edit(() => setSetKind(set.id, set.kind === "warmup" ? "working" : "warmup"));
            }}
            onRpe={(set, rpe) => void edit(() => updateSetRpe(set.id, rpe))}
            onFormRating={(set, rating) => {
              tapFeedback();
              void edit(() => setSetFormRating(set.id, rating));
            }}
            onSetOptions={(set) => setSetFor({ exercise, set })}
            onRemoveSet={(set) => void removeSet(set)}
            onAddSet={() => {
              if (exercise.unilateral) setNewPairFor(exercise);
              else void edit(() => addSetToCompletedWorkout(id, exercise.entryId));
            }}
            onOptions={() => setExerciseFor(exercise)}
          />
        )}
      />

      <View style={styles.footerRow}>
        <View style={styles.footerCellWide}>
          <ActionButton icon="bookmark-outline" label={t("saveToProgram.action")} variant="ghost" onPress={() => setSaveOpen(true)} />
        </View>
        <View style={styles.footerCellWide}>
          <ActionButton icon="share-social-outline" label={t("shareCard.action")} variant="ghost" onPress={() => router.push({ pathname: "/workout/share/[id]", params: { id } })} />
        </View>
        <View style={styles.footerCellWide}>
          <ActionButton icon="trash-outline" label={t("history.delete")} variant="danger" onPress={() => setDeleteOpen(true)} />
        </View>
      </View>

      {setFor && liveSet ? (
        <SetSheet
          key={liveSet.id}
          exercise={setFor.exercise}
          set={liveSet}
          onClose={() => setSetFor(null)}
          onChanged={refresh}
          onRemoved={(removed) => { if (removed) setUndo({ message: t("logger.removedSet", { number: liveSet.index }), removed }); }}
          onPair={() => {
            const pairedSet = liveSet.pairId
              ? (setFor.exercise.sets.find((candidate) => candidate.pairId === liveSet.pairId && candidate.id !== liveSet.id) ?? null)
              : null;
            setSetFor(null);
            setPairFor({ exercise: setFor.exercise, set: liveSet, pairedSet });
          }}
        />
      ) : null}

      {newPairFor ? (
        <PairEditor key={`new-${newPairFor.entryId}`} visible workoutId={id} exercise={newPairFor}
          newPair entryId={newPairFor.entryId} onClose={() => setNewPairFor(null)}
          onSaved={() => { setNewPairFor(null); void refresh(); }} />
      ) : null}
      {pairFor ? (
        <PairEditor
          key={`${pairFor.set.id}-${pairFor.pairedSet?.id ?? "legacy"}`}
          visible
          workoutId={id}
          exercise={pairFor.exercise}
          set={pairFor.set}
          pairedSet={pairFor.pairedSet}
          onClose={() => setPairFor(null)}
          onSaved={() => {
            setPairFor(null);
            void refresh();
          }}
        />
      ) : null}

      <ExerciseSheet
        exercise={exerciseFor}
        onClose={() => setExerciseFor(null)}
        onChanged={() => void refresh()}
        onRemove={(exercise) => {
          setExerciseFor(null);
          if (exercise.sets.some((set) => set.clipCount > 0)) {
            void edit(() => removeExerciseEntry(exercise.entryId));
            return;
          }
          void edit(async () => {
            const removed = await removeExerciseEntryWithUndo(exercise.entryId);
            if (removed)
              setUndo({ message: t("logger.removedExercise", { name: exercise.name }), removed });
          });
        }}
      />

      {detailsOpen ? (
        <DetailsSheet
          workout={workout}
          locale={locale}
          onClose={() => setDetailsOpen(false)}
          onSave={async (details) => {
            await updateCompletedWorkoutDetails(id, details);
            setDetailsOpen(false);
            await refresh();
          }}
        />
      ) : null}

      <Sheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("history.deleteTitle", { name: workout.name })}
        body={t("history.deleteBody", { count: completedSets })}
      >
        <ActionButton
          icon="trash-outline"
          label={t("history.deleteConfirm")}
          variant="danger"
          onPress={() => void confirmDelete()}
        />
        <ActionButton label={t("common.cancel")} secondary onPress={() => setDeleteOpen(false)} />
      </Sheet>

      <SaveToProgramSheet
        visible={saveOpen}
        defaultName={workout.name}
        exercises={workout.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.filter((set) => set.completedAt),
        }))}
        onClose={() => setSaveOpen(false)}
        onSaved={(program) => {
          setSaveOpen(false);
          setSaved({ id: program.id, name: program.name });
        }}
      />
      <Toast
        message={saved ? t("saveToProgram.saved", { name: saved.name }) : null}
        actionLabel={t("saveToProgram.open")}
        onAction={() => {
          if (saved) router.push({ pathname: "/program/user/[id]", params: { id: saved.id } });
        }}
        onHide={() => setSaved(null)}
        bottomOffset={0}
      />

      <ExercisePicker
        visible={pickerOpen}
        title={t("workout.addExercise")}
        subtitle={t("history.pickerSubtitle")}
        onChoose={chooseExercise}
        onCreate={(name) => {
          setPickerOpen(false);
          router.push({
            pathname: "/exercise/new",
            params: { addToPast: id, ...(name ? { name } : {}) },
          });
        }}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}


function ExerciseSheet({
  exercise,
  onClose,
  onChanged,
  onRemove,
}: {
  exercise: SessionExercise | null;
  onClose: () => void;
  onChanged: () => void;
  onRemove: (exercise: SessionExercise) => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    setConfirming(false);
    onClose();
  };
  return (
    <Sheet
      visible={exercise !== null}
      onClose={close}
      title={
        confirming
          ? t("logger.removeExerciseTitle", { name: exercise?.name ?? "" })
          : (exercise?.name ?? t("logger.options"))
      }
      body={
        confirming
          ? t("logger.removeExerciseBody", { count: exercise?.sets.length ?? 0 })
          : undefined
      }
    >
      {confirming ? (
        <>
          <ActionButton
            icon="trash-outline"
            label={t("logger.confirmRemove")}
            variant="danger"
            onPress={() => {
              setConfirming(false);
              if (exercise) onRemove(exercise);
            }}
          />
          <ActionButton label={t("common.cancel")} secondary onPress={() => setConfirming(false)} />
        </>
      ) : (
        <>
          {exercise ? (
            <ExerciseNoteField
              key={exercise.entryId}
              entryId={exercise.entryId}
              initial={exercise.notes}
              onSaved={onChanged}
            />
          ) : null}
          {exercise ? <ExerciseAveragesField key={`averages-${exercise.entryId}`} exercise={exercise} onChanged={onChanged} /> : null}
          <ActionButton
            icon="construct-outline"
            label={t("logger.editExercise")}
            secondary
            onPress={() => {
              if (!exercise) return;
              const exerciseId = exercise.exerciseId;
              close();
              router.push({ pathname: "/exercise/new", params: { edit: exerciseId } });
            }}
          />
          <ActionButton
            icon="trash-outline"
            label={t("logger.removeExercise")}
            variant="danger"
            onPress={() => {
              if (exercise?.sets.some((set) => set.clipCount > 0)) setConfirming(true);
              else if (exercise) onRemove(exercise);
            }}
          />
          <ActionButton label={t("common.cancel")} secondary onPress={close} />
        </>
      )}
    </Sheet>
  );
}

/** Name, day, start time and length of a finished workout, edited with steppers. */
function DetailsSheet({
  workout,
  locale,
  onClose,
  onSave,
}: {
  workout: CompletedWorkout;
  locale: string;
  onClose: () => void;
  onSave: (details: { name: string; startedAt: Date; endedAt: Date }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(workout.name);
  const [start, setStart] = useState(workout.startedAt.getTime());
  const [minutes, setMinutes] = useState(
    Math.max(1, Math.round((workout.endedAt.getTime() - workout.startedAt.getTime()) / 60_000)),
  );
  const [error, setError] = useState<string | null>(null);
  const startDate = new Date(start);

  const save = async () => {
    if (!name.trim()) {
      setError(t("history.nameRequired"));
      return;
    }
    const startedAt = new Date(start);
    if (startedAt.getTime() > Date.now()) {
      setError(t("history.futureStart"));
      return;
    }
    try {
      await onSave({ name, startedAt, endedAt: new Date(start + minutes * 60_000) });
    } catch {
      setError(t("history.saveError"));
    }
  };

  return (
    <Sheet visible onClose={onClose} title={t("history.editDetails")}>
      <TextField
        label={t("history.name")}
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(null);
        }}
        maxLength={WORKOUT_NAME_MAX}
      />
      <DateField
        label={t("history.day")}
        value={startDate}
        locale={locale}
        maxDate={new Date()}
        onChange={(next) => {
          setStart(next.getTime());
          setError(null);
        }}
      />
      <TimeField
        label={t("history.startTime")}
        hour={startDate.getHours()}
        minute={startDate.getMinutes()}
        locale={locale}
        onChange={(hour, minute) => {
          const next = new Date(start);
          next.setHours(hour, minute, 0, 0);
          setStart(next.getTime());
          setError(null);
        }}
      />
      <Stepper
        layout="row"
        label={t("history.duration")}
        value={minutes}
        display={t("history.durationValue", { count: minutes })}
        step={5}
        min={1}
        max={600}
        editable
        presets={[30, 45, 60, 75, 90]}
        presetLabel={(value) => t("history.durationValue", { count: value })}
        onChange={setMinutes}
      />
      {error ? <Body accessibilityLiveRegion="polite">{error}</Body> : null}
      <ActionButton icon="checkmark" label={t("common.save")} onPress={() => void save()} />
      <ActionButton label={t("common.cancel")} secondary onPress={onClose} />
    </Sheet>
  );
}

const baseStyles = StyleSheet.create({
  mobility: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: -8,
  },
  mobilityText: { fontFamily: fonts.semibold, fontSize: 14 },
  error: { fontFamily: fonts.medium, fontSize: 14 },
  foldAll: { alignSelf: "flex-end", minHeight: 48, justifyContent: "center" },
  footerRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  // Long labels: side by side only when each gets room for one line.
  footerCellWide: { flex: 1, minWidth: 220 },
  foldAllText: { fontFamily: fonts.semibold, fontSize: 14 },
});
