import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Body, Card, Label, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, Stepper, SwitchRow } from "../../src/shared/components/ui";
import { readDefaultRest, writeDefaultRest } from "../../src/features/session/restDefaults";
import { formatClock } from "../../src/shared/utils/format";
import { readBooleanPreference, RPE_PROMPT_KEY, writePreference } from "../../src/shared/settings/preferences";
import { UI_SCALES, type UiScale } from "../../src/shared/theme/scale";
import i18n, { setAppLanguage } from "../../src/shared/i18n";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";
import { useAnimationSettings } from "../../src/shared/settings/AnimationProvider";

export default function ProfileScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { preference, setMode, palette, scale, setScale } = useTheme();
  const { speed, setSpeed, reducedMotion } = useAnimationSettings();
  const [rpePrompt, setRpePrompt] = useState(() => readBooleanPreference(RPE_PROMPT_KEY, true));
  const [rest, setRest] = useState(() => ({ working: readDefaultRest("working"), warmup: readDefaultRest("warmup") }));
  const changeRest = (kind: "working" | "warmup", seconds: number) => { setRest((current) => ({ ...current, [kind]: seconds })); writeDefaultRest(kind, seconds); };
  const sizeLabels = [t("profile.sizeCompact"), t("profile.sizeSnug"), t("profile.sizeDefault"), t("profile.sizeLarge")];
  const language = i18n.language.startsWith("it") ? "it" : "en";
  return (
    <Screen>
      <PageHeading title={t("profile.title")} subtitle={t("profile.subtitle")} />

      <SectionTitle title={t("profile.training")} />
      <ListGroup>
        <ListRow icon="flag-outline" title={t("profile.goals")} onPress={() => router.push("/goals")} />
        <ListRow icon="notifications-outline" title={t("profile.reminders")} onPress={() => router.push("/reminders")} />
      </ListGroup>

      <SectionTitle title={t("profile.body")} />
      <ListGroup>
        <ListRow icon="scale-outline" title={t("profile.bodyweight")} onPress={() => router.push("/bodyweight")} />
        <ListRow icon="images-outline" title={t("profile.photos")} onPress={() => router.push("/photos")} />
        <ListRow icon="resize-outline" title={t("profile.measurements")} onPress={() => router.push("/measurements")} />
        <ListRow icon="body-outline" title={t("profile.mobility")} onPress={() => router.push("/mobility")} />
      </ListGroup>

      <SectionTitle title={t("profile.preferences")} />
      <Card>
        <Label>{t("profile.appearance")}</Label>
        <SegmentedControl<"light" | "dark" | "system"> value={preference} onChange={setMode} options={[{ value: "light", label: t("profile.light") }, { value: "dark", label: t("profile.dark") }, { value: "system", label: t("profile.system") }]} />
        <Label style={styles.spaced}>{t("profile.language")}</Label>
        <SegmentedControl value={language} onChange={(next) => void setAppLanguage(next)} options={[{ value: "en", label: "English" }, { value: "it", label: "Italiano" }]} />
        <Label style={styles.spaced}>{t("profile.interfaceSize")}</Label>
        <SegmentedControl<string>
          value={String(scale)}
          onChange={(next) => setScale(Number(next) as UiScale)}
          options={UI_SCALES.map((value, index) => ({ value: String(value), label: sizeLabels[index] }))}
        />
        <Body>{t("profile.interfaceSizeHint")}</Body>
        <Label style={styles.spaced}>{t("profile.animation")}</Label>
        <SegmentedControl<string>
          value={speed}
          onChange={(next) => setSpeed(next as "normal" | "fast" | "off")}
          options={[
            { value: "normal", label: t("profile.animationNormal") },
            { value: "fast", label: t("profile.animationFast") },
            { value: "off", label: t("profile.animationOff") },
          ]}
        />
        {reducedMotion ? <Body>{t("profile.animationReducedMotion")}</Body> : null}
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
      <Card>
        <Stepper layout="row" label={t("logger.restWorking")} value={rest.working} display={formatClock(rest.working)} step={15} min={0} max={600} onChange={(value) => changeRest("working", value)} />
        <Stepper layout="row" label={t("logger.restWarmup")} value={rest.warmup} display={formatClock(rest.warmup)} step={15} min={0} max={600} onChange={(value) => changeRest("warmup", value)} />
        <Body>{t("profile.restHint")}</Body>
      </Card>

      <SectionTitle title={t("profile.data")} />
      <ListGroup>
        <ListRow icon="cloud-download-outline" title={t("profile.backup")} onPress={() => router.push("/data")} />
      </ListGroup>

      <View style={[styles.about, { borderTopColor: palette.border }]}>
        <Label>{t("profile.about")}</Label>
        <Body>{t("profile.aboutBody")}</Body>
      </View>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  spaced: { marginTop: 6 },
  about: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 18, gap: 4 },
});
