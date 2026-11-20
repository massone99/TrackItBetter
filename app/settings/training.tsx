import { useBooleanPreference } from "../../src/shared/settings/useBooleanPreference";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { spacing } from "../../src/shared/theme/tokens";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";
import { useTranslation } from "react-i18next";
import { Body, Card, ListGroup, PageHeading, Screen, SectionTitle, SegmentedControl, SwitchRow } from "../../src/shared/components/ui";
import { DurationField } from "../../src/shared/components/DateTimePickers";
import { ANNOUNCEMENT_WAIT_KEY, MAX_ANNOUNCEMENT_WAIT_SEC, PREP_VOICE_KEY, WORK_VOICE_KEY, readAnnouncementWaitSec, MAX_NARRATION_PREP_SEC, readNarrationPrepSec, writeNarrationPrepSec } from "../../src/features/narration/settings";
import { readDefaultRest, writeDefaultRest } from "../../src/features/session/restDefaults";
import { SET_RATINGS_KEY, COMPARE_MODE_KEY, readBooleanPreference, readCompareMode, RPE_PROMPT_KEY, writePreference, type CompareMode } from "../../src/shared/settings/preferences";

/** Workout defaults: rest, the RPE row, what "last time" compares with, and the narration countdown. */
export default function TrainingSettingsScreen() {
  const { t } = useTranslation();
  const styles = useScaledStyles(baseStyles);
  const [rpePrompt, setRpePrompt] = useState(() => readBooleanPreference(RPE_PROMPT_KEY, true));
  const [compareMode, setCompareMode] = useState<CompareMode>(readCompareMode);
  const [ratings, setRatings] = useBooleanPreference(SET_RATINGS_KEY, true);
  const [announcementWait, setAnnouncementWait] = useState(readAnnouncementWaitSec);
  const [workVoice, setWorkVoice] = useBooleanPreference(WORK_VOICE_KEY, true);
  const [prepVoice, setPrepVoice] = useBooleanPreference(PREP_VOICE_KEY, true);
  const [prepSec, setPrepSec] = useState(readNarrationPrepSec);
  const [rest, setRest] = useState(() => ({ working: readDefaultRest("working"), warmup: readDefaultRest("warmup") }));
  const changeRest = (kind: "working" | "warmup", seconds: number) => { setRest((current) => ({ ...current, [kind]: seconds })); writeDefaultRest(kind, seconds); };
  return (
    <Screen>
      <PageHeading title={t("simple.workoutDefaults")} />
      <SectionTitle title={t("profile.restTitle")} />
      <Card>
        <DurationField label={t("logger.restWorking")} value={rest.working} max={600} presets={[30, 60, 90, 120, 180]} format={(seconds) => t("userProgram.secondsValue", { value: seconds })} onChange={(value) => changeRest("working", value)} />
        <DurationField label={t("logger.restWarmup")} value={rest.warmup} max={600} presets={[30, 60, 90, 120, 180]} format={(seconds) => t("userProgram.secondsValue", { value: seconds })} onChange={(value) => changeRest("warmup", value)} />
        <Body>{t("profile.restHint")}</Body>
      </Card>
      <ListGroup>
        <SwitchRow icon="options-outline" title={t("profile.ratings")} value={ratings} onChange={setRatings} />
        <SwitchRow
          icon="speedometer-outline"
          title={t("profile.rpePrompt")}
          subtitle={t("profile.rpePromptHint")}
          value={rpePrompt}
          onChange={(next) => { setRpePrompt(next); writePreference(RPE_PROMPT_KEY, String(next)); }}
        />
      </ListGroup>
      <SectionTitle title={t("compare.profileTitle")} />
      <Card>
        <SegmentedControl
          value={compareMode}
          onChange={(next) => { setCompareMode(next); writePreference(COMPARE_MODE_KEY, next); }}
          options={[{ value: "session", label: t("compare.modeSession") }, { value: "any", label: t("compare.modeAny") }]}
        />
        <Body>{t("compare.profileHint")}</Body>
      </Card>
      <View style={styles.narration}>
        <SectionTitle title={t("narration.title")} />
        <Card style={styles.timing}>
          <View style={styles.preparation}>
            <DurationField label={t("narration.prep")} value={prepSec} min={0} max={MAX_NARRATION_PREP_SEC} step={1} presets={[0, 3, 5, 10]} format={(seconds) => seconds === 0 ? t("narration.prepOff") : t("userProgram.secondsValue", { value: seconds })} onChange={(value) => { setPrepSec(value); writeNarrationPrepSec(value); }} />
            <Body>{t("narration.prepHint")}</Body>
          </View>
          <DurationField label={t("narration.announcementWait")} value={announcementWait} min={1} max={MAX_ANNOUNCEMENT_WAIT_SEC} step={1} presets={[1, 3, 5, 8]} format={(seconds) => t("userProgram.secondsValue", { value: seconds })} onChange={(next) => { setAnnouncementWait(next); writePreference(ANNOUNCEMENT_WAIT_KEY, String(next)); }} />
        </Card>
        <ListGroup>
          <SwitchRow icon="volume-high-outline" title={t("narration.workVoice")} value={workVoice} onChange={setWorkVoice} />
          <SwitchRow icon="volume-high-outline" title={t("narration.prepVoice")} value={prepVoice} onChange={setPrepVoice} />
        </ListGroup>
      </View>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  narration: { gap: spacing.md, marginTop: spacing.xs },
  timing: { paddingVertical: spacing.lg, gap: spacing.lg },
  preparation: { gap: spacing.sm },
});
