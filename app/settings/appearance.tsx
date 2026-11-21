import { router } from "expo-router";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Icon, Label, ListGroup, ListRow, PageHeading, Screen, SegmentedControl, Text, tapFeedback } from "../../src/shared/components/ui";
import i18n, { setAppLanguage } from "../../src/shared/i18n";
import { UI_SCALES, type TextScaleMode, type UiScale } from "../../src/shared/theme/scale";
import { presetOf } from "../../src/shared/theme/fontChoices";
import { useInk } from "../../src/shared/theme/ink";
import { useTheme } from "../../src/shared/theme/ThemeProvider";
import { useAnimationSettings } from "../../src/shared/settings/AnimationProvider";
import { fonts } from "../../src/shared/theme/typography";
import { MIN_TOUCH_TARGET, radii, spacing } from "../../src/shared/theme/tokens";
import { useScaledStyles } from "../../src/shared/theme/useScaledStyles";

/** One labelled setting: its label above, the control below. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View style={fieldStyle.field}><Label>{label}</Label>{children}</View>;
}

/** Appearance and text: a live preview on top, so size, text and font changes show while they are made. */
export default function AppearanceScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { preference, setMode, palette, scale, setScale, textScaleMode, setTextScaleMode, layoutScale, fontScale, fontSelection, setLayout } = useTheme();
  const { speed, setSpeed, reducedMotion } = useAnimationSettings();
  const ink = useInk();
  const language = i18n.language.startsWith("it") ? "it" : "en";
  const index = UI_SCALES.indexOf(scale);
  const sizeName = scale === 1 ? t("profile.sizeDefault") : scale < 1 ? t("profile.sizeCompact") : t("profile.sizeLarge");
  const step = (delta: number) => {
    const next = UI_SCALES[index + delta];
    if (next !== undefined) { tapFeedback(); setScale(next as UiScale); }
  };
  const preset = presetOf(fontSelection);
  const fontValue = preset ? t(`profile.fontPreset${preset.charAt(0).toUpperCase()}${preset.slice(1)}`) : t("profile.fontPresetCustom");
  const setsValue = `${t(setLayout.rows === "table" ? "profile.setsRowsTable" : "profile.setsRowsOpen")} · ${t(setLayout.buttons === "large" ? "profile.setsButtonsLarge" : "profile.setsButtonsStandard")}`;
  const sizeButton = (delta: number, label: string, text: string) => {
    const disabled = UI_SCALES[index + delta] === undefined;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={() => step(delta)}
        style={[styles.sizeButton, { borderColor: ink, backgroundColor: palette.surface, opacity: disabled ? 0.4 : 1 }]}>
        <Text style={[styles.sizeButtonText, { color: palette.text }]}>{text}</Text>
      </Pressable>
    );
  };
  return (
    <Screen>
      {/* A new size rebuilds the page from scratch, so no row keeps the layout measured at the previous size. */}
      <Fragment key={`${layoutScale}-${fontScale}`}>
        <PageHeading title={t("simple.appearance")} />
        <Card>
          <Label style={{ color: palette.accentStrong }}>{t("simple.previewLive")}</Label>
          <View>
            <Text style={[styles.previewTitle, { color: palette.text }]}>{t("profile.fontSampleTitle")}</Text>
            <Text style={[styles.previewBody, { color: palette.textMuted }]}>{t("profile.fontSampleBody")}</Text>
          </View>
          <View style={styles.previewRow} accessible={false} importantForAccessibility="no-hide-descendants">
            <View style={[styles.previewBox, { borderColor: ink }]}><Icon name="remove" size={18} color={palette.text} /></View>
            <View style={[styles.previewValue, { borderColor: ink }]}>
              <Text style={[styles.previewNumber, { color: palette.text }]}>8</Text>
              <Label>{t("profile.fontSampleReps")}</Label>
            </View>
            <View style={[styles.previewBox, { borderColor: ink }]}><Icon name="add" size={18} color={palette.text} /></View>
            <View style={[styles.previewAction, { backgroundColor: palette.accent }]}><Text style={[styles.previewActionText, { color: palette.accentText }]}>{t("simple.complete")}</Text></View>
          </View>
        </Card>

        <Field label={t("simple.theme")}>
          <SegmentedControl<"light" | "dark" | "system"> value={preference} onChange={setMode} options={[{ value: "light", label: t("profile.light") }, { value: "dark", label: t("profile.dark") }, { value: "system", label: t("profile.system") }]} />
        </Field>
        <Field label={t("profile.language")}>
          <SegmentedControl value={language} onChange={(next) => void setAppLanguage(next)} options={[{ value: "en", label: "English" }, { value: "it", label: "Italiano" }]} />
        </Field>
        <Field label={t("profile.interfaceSize")}>
          <View style={styles.sizeRow}>
            {sizeButton(-1, t("simple.smaller"), "A−")}
            <View accessible accessibilityLabel={`${t("profile.interfaceSize")}: ${Math.round(scale * 100)} %, ${sizeName}`} style={[styles.sizeValue, { borderColor: ink, backgroundColor: palette.surface }]}>
              <Text style={[styles.sizePercent, { color: palette.text }]}>{`${Math.round(scale * 100)} %`}</Text>
              <Label>{sizeName}</Label>
            </View>
            {sizeButton(1, t("simple.larger"), "A+")}
          </View>
        </Field>
        <Field label={t("profile.textScale")}>
          <SegmentedControl<TextScaleMode> value={textScaleMode} onChange={setTextScaleMode} options={[{ value: "full", label: t("profile.textScaleFull") }, { value: "limited", label: t("profile.textScaleLimited") }]} />
        </Field>
        <Field label={t("profile.animation")}>
          <SegmentedControl<string>
            value={speed}
            onChange={(next) => setSpeed(next as "normal" | "fast" | "off")}
            options={[{ value: "normal", label: t("profile.animationNormal") }, { value: "fast", label: t("profile.animationFast") }, { value: "off", label: t("profile.animationOff") }]}
          />
          {reducedMotion ? <Text style={[styles.hint, { color: palette.textMuted }]}>{t("profile.animationReducedMotion")}</Text> : null}
        </Field>
        <ListGroup>
          <ListRow title={t("profile.fontTitle")} value={fontValue} onPress={() => router.push("/settings/font")} />
          <ListRow title={t("simple.setsLayout")} value={setsValue} onPress={() => router.push("/settings/sets")} />
        </ListGroup>
      </Fragment>
    </Screen>
  );
}

const fieldStyle = StyleSheet.create({ field: { gap: spacing.sm } });

const baseStyles = StyleSheet.create({
  previewTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, textTransform: "uppercase" },
  previewBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  previewBox: { width: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  previewValue: { flexGrow: 1, flexBasis: 80, minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderRadius: radii.control, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: spacing.xs, paddingTop: spacing.xs },
  previewNumber: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38 },
  previewAction: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: spacing.md, borderRadius: radii.control, justifyContent: "center" },
  previewActionText: { fontFamily: fonts.display, fontSize: 15, letterSpacing: 0.6, textTransform: "uppercase" },
  sizeRow: { flexDirection: "row", alignItems: "stretch", gap: spacing.sm },
  sizeButton: { minWidth: 56, minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  sizeButtonText: { fontFamily: fonts.display, fontSize: 17 },
  sizeValue: { flex: 1, minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderRadius: radii.control, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  sizePercent: { fontFamily: fonts.monoSemibold, fontSize: 16 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
});
