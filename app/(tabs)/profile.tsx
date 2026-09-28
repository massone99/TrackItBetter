import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { Body, Card, Label, ListGroup, ListRow, PageHeading, Screen, SectionTitle, SegmentedControl, SwitchRow } from "../../src/shared/components/ui";
import { readBooleanPreference, RPE_PROMPT_KEY, writePreference } from "../../src/shared/settings/preferences";
import { UI_SCALES, type UiScale } from "../../src/shared/theme/scale";
import i18n, { setAppLanguage } from "../../src/shared/i18n";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";

export default function ProfileScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { preference, setMode, palette, scale, setScale } = useTheme();
  const [rpePrompt, setRpePrompt] = useState(() => readBooleanPreference(RPE_PROMPT_KEY, true));
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
