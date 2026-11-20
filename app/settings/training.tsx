import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Body, Card, ListGroup, PageHeading, Screen, SectionTitle, SegmentedControl, SwitchRow } from "../../src/shared/components/ui";
import { DurationField } from "../../src/shared/components/DateTimePickers";
import { MAX_NARRATION_PREP_SEC, readNarrationPrepSec, writeNarrationPrepSec } from "../../src/features/narration/settings";
import { readDefaultRest, writeDefaultRest } from "../../src/features/session/restDefaults";
import { COMPARE_MODE_KEY, readBooleanPreference, readCompareMode, RPE_PROMPT_KEY, writePreference, type CompareMode } from "../../src/shared/settings/preferences";

/** Workout defaults: rest, the RPE row, what "last time" compares with, and the narration countdown. */
export default function TrainingSettingsScreen() {
  const { t } = useTranslation();
  const [rpePrompt, setRpePrompt] = useState(() => readBooleanPreference(RPE_PROMPT_KEY, true));
  const [compareMode, setCompareMode] = useState<CompareMode>(readCompareMode);
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
      <SectionTitle title={t("narration.title")} />
      <Card>
        <DurationField label={t("narration.prep")} value={prepSec} min={0} max={MAX_NARRATION_PREP_SEC} step={1} presets={[0, 3, 5, 10]} format={(seconds) => seconds === 0 ? t("narration.prepOff") : t("userProgram.secondsValue", { value: seconds })} onChange={(value) => { setPrepSec(value); writeNarrationPrepSec(value); }} />
        <Body>{t("narration.prepHint")}</Body>
      </Card>
    </Screen>
  );
}
