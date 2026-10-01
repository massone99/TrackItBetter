import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import type { PairEditValues, SessionExercise, SessionSet } from "./repository";
import { addCompletedPair, saveCompletedPair } from "./repository";
import { RpePicker } from "./RpePicker";
import { HoldDurationField } from "../../shared/components/DateTimePickers";
import {
  ActionButton,
  Body,
  Chip,
  Heading,
  NumberEdit,
  SegmentedControl,
  Sheet,
  Text,
  tapFeedback,
} from "../../shared/components/ui";
import { useTheme } from "../../shared/theme/ThemeProvider";
import { fonts } from "../../shared/theme/typography";
import { useScaledStyles } from "../../shared/theme/useScaledStyles";

export type PairEditorProps = {
  visible: boolean;
  workoutId: string;
  exercise: SessionExercise;
  /** The row which opened the editor. Its id remains the original row on conversion. */
  set?: SessionSet | null;
  /** Exercise entry used when creating a new pair. */
  entryId?: string;
  newPair?: boolean;
  /** The other member of an already linked pair, when one exists. */
  pairedSet?: SessionSet | null;
  onClose: () => void;
  onSaved?: () => void;
};

function valuesOf(set: SessionSet | null | undefined): PairEditValues {
  return {
    reps: set?.reps ?? 0,
    durationSec: set?.durationSec ?? 0,
    distanceM: set?.distanceM ?? 0,
    addedLoadKg: set?.addedLoadKg ?? 0,
    rpe: set?.rpe ?? null,
  };
}

/**
 * Editor for a linked L/R pair and for explicit conversion of one legacy row.
 * The repository writes both rows in one transaction; this component only keeps
 * an in-memory draft until the user presses Save.
 */
export function PairEditor({
  visible,
  workoutId,
  exercise,
  set,
  newPair = false,
  entryId,
  pairedSet,
  onClose,
  onSaved,
}: PairEditorProps) {
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const timed = exercise.metric === "time" || exercise.metric === "time_load";
  const distance = exercise.metric === "distance";
  const loaded = exercise.metric === "reps_load" || exercise.metric === "time_load";
  const isLinked = Boolean(set?.pairId && pairedSet);
  const sideText = (side: "left" | "right", short = false) => {
    if (short) return side === "left" ? "L" : "R";
    if (i18n.language.startsWith("it")) return side === "left" ? "Sinistro" : "Destro";
    return side === "left" ? "Left" : "Right";
  };
  const initialLeft = newPair ? exercise.sets.filter((s) => s.side === 'left').at(-1) : set?.side === "right" && pairedSet ? pairedSet : set;
  const initialRight = newPair ? exercise.sets.filter((s) => s.side === 'right').at(-1) : set?.side === "right" && pairedSet ? set : (pairedSet ?? set);
  const defaults: PairEditValues = { reps: timed || distance ? null : 8, durationSec: timed ? 10 : null, distanceM: distance ? 10 : null, addedLoadKg: 0, rpe: null };
  const [left, setLeft] = useState<PairEditValues>(() => initialLeft ? valuesOf(initialLeft) : defaults);
  const [right, setRight] = useState<PairEditValues>(() => initialRight ? valuesOf(initialRight) : defaults);
  const [otherSetId, setOtherSetId] = useState<string | undefined>();
  const [originalSide, setOriginalSide] = useState<"left" | "right">(
    set?.side === "right" ? "right" : "left",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (side: "left" | "right", field: keyof PairEditValues, value: number | null) => {
    const setter = side === "left" ? setLeft : setRight;
    setter((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (newPair) await addCompletedPair(workoutId, entryId ?? exercise.entryId, left, right);
      else if (set) await saveCompletedPair(workoutId, set.id, originalSide, left, right, otherSetId);
      else throw new Error('Missing set');
      tapFeedback("success");
      onSaved?.();
      onClose();
    } catch {
      setError(
        t("history.saveError", { defaultValue: "Could not save this pair. Please try again." }),
      );
    } finally {
      setSaving(false);
    }
  };

  const pairNumber = set?.index ?? Math.max(0, ...exercise.sets.map((s) => s.index)) + 1;
  const title = `${exercise.name} · ${t("history.set", { number: pairNumber, defaultValue: `Set ${pairNumber}` })}`;
  const sideLabel = (side: "left" | "right") => `${sideText(side)} (${sideText(side, true)})`;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      body={
        isLinked || newPair
          ? t("history.pairEditBody", {
              defaultValue:
                "Edit both sides. Notes and videos stay attached to their original side.",
            })
          : t("history.pairConvertBody", {
              defaultValue:
                "Choose which side keeps the original row, then confirm both values before saving.",
            })
      }
    >
      {!isLinked && !newPair ? (
        <View style={styles.assignment}>
          <Text style={[styles.label, { color: palette.textMuted }]}>
            {t("history.originalSide", { defaultValue: "Original row is" })}
          </Text>
          <SegmentedControl
            value={originalSide}
            options={[
              { value: "left", label: sideLabel("left") },
              { value: "right", label: sideLabel("right") },
            ]}
            onChange={(side) => {
              if (otherSetId && side !== originalSide) { setLeft(right); setRight(left); }
              setOriginalSide(side);
            }}
          />
          {exercise.sets.filter((s) => s.id !== set?.id && !s.pairId && s.kind === set?.kind && (s.side === 'left' || s.side === 'right')).map((s) => (
            <Chip key={s.id} label={`Associa serie ${s.index} · ${sideLabel(s.side as 'left' | 'right')}`} selected={otherSetId === s.id}
              onPress={() => {
                setOtherSetId(otherSetId === s.id ? undefined : s.id);
                const values = valuesOf(otherSetId === s.id ? set : s);
                if (originalSide === 'left') setRight(values); else setLeft(values);
              }} />
          ))}
        </View>
      ) : null}
      <View style={styles.sideGrid}>
        <SideFields
          label={sideLabel("left")}
          values={left}
          timed={timed}
          distance={distance}
          loaded={loaded}
          onChange={(field, value) => update("left", field, value)}
        />
        <SideFields
          label={sideLabel("right")}
          values={right}
          timed={timed}
          distance={distance}
          loaded={loaded}
          onChange={(field, value) => update("right", field, value)}
        />
      </View>
      {error ? (
        <Body style={{ color: palette.warning }} accessibilityLiveRegion="polite">
          {error}
        </Body>
      ) : null}
      <ActionButton
        icon="checkmark"
        label={t("common.save", { defaultValue: "Save" })}
        disabled={saving}
        onPress={() => void save()}
      />
      <ActionButton
        label={t("common.cancel", { defaultValue: "Cancel" })}
        secondary
        disabled={saving}
        onPress={onClose}
      />
    </Sheet>
  );
}

function SideFields({
  label,
  values,
  timed,
  distance,
  loaded,
  onChange,
}: {
  label: string;
  values: PairEditValues;
  timed: boolean;
  distance: boolean;
  loaded: boolean;
  onChange: (field: keyof PairEditValues, value: number | null) => void;
}) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const styles = useScaledStyles(baseStyles);
  const value = timed
    ? (values.durationSec ?? 0)
    : distance
      ? (values.distanceM ?? 0)
      : (values.reps ?? 0);
  const unit = timed
    ? t("history.units.seconds", { defaultValue: "sec" })
    : distance
      ? t("history.units.meters", { defaultValue: "m" })
      : t("history.units.reps", { defaultValue: "reps" });
  const metricLabel = timed
    ? t("logger.holdCol", { defaultValue: "Hold" })
    : distance
      ? t("history.units.meters", { defaultValue: "Distance" })
      : t("history.units.reps", { defaultValue: "Reps" });

  return (
    <View style={[styles.side, { borderColor: palette.border }]}>
      <Heading style={styles.sideTitle}>{label}</Heading>
      {timed ? (
        <HoldDurationField
          compact
          value={value}
          label={`${metricLabel} · ${label}`}
          onChange={(next) => onChange("durationSec", next)}
        />
      ) : (
        <NumberEdit
          value={value}
          display={`${value} ${unit}`}
          label={`${metricLabel} · ${label}`}
          onCommit={(next) =>
            onChange(
              distance ? "distanceM" : "reps",
              distance ? Math.round(next * 100) / 100 : Math.round(next),
            )
          }
          style={[styles.mainValue, { color: palette.text }]}
        />
      )}
      {loaded ? (
        <NumberEdit
          value={values.addedLoadKg}
          display={`${values.addedLoadKg} ${t("history.units.kg", { defaultValue: "kg" })}`}
          label={`${t("history.addedLoad", { defaultValue: "Added load" })} · ${label}`}
          allowNegative
          onCommit={(next) => onChange("addedLoadKg", next)}
          style={[styles.loadValue, { color: palette.text }]}
        />
      ) : null}
      <RpePicker sideLabel={label} value={values.rpe} onChange={(next) => onChange("rpe", next)} />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  assignment: { gap: 6 },
  label: { fontFamily: fonts.medium, fontSize: 13 },
  sideGrid: { gap: 12 },
  side: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12, gap: 10 },
  sideTitle: { fontSize: 20, lineHeight: 24 },
  mainValue: { alignSelf: "flex-start", fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  loadValue: { alignSelf: "flex-start", fontFamily: fonts.display, fontSize: 20, lineHeight: 26 },
});
