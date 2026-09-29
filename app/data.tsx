import { useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { ActionButton, Body, Card, Chip, Heading, Icon, PageHeading, Screen, Sheet, Stepper } from "../src/shared/components/ui";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { importBackup, type BackupScope, type ImportMode } from "../src/features/data/backup";
import { shareBackupFile } from "../src/features/data/shareBackup";
import { useScaledStyles } from "../src/shared/theme/useScaledStyles";

export default function DataScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t, i18n } = useTranslation();
  const { palette } = useTheme();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  // Contents of a picked backup, waiting for the user to pick merge or replace.
  const [pending, setPending] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  // Days back from today, inclusive on both ends.
  const [fromDaysAgo, setFromDaysAgo] = useState(29);
  const [toDaysAgo, setToDaysAgo] = useState(0);

  const dayAt = (daysAgo: number, end: boolean) => {
    const day = new Date();
    day.setDate(day.getDate() - daysAgo);
    if (end) day.setHours(23, 59, 59, 999);
    else day.setHours(0, 0, 0, 0);
    return day;
  };
  const formatDay = (daysAgo: number) => dayAt(daysAgo, false).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" });

  const createBackupFile = async (scope: BackupScope = { kind: "full" }) => {
    setRangeOpen(false);
    setWorking(true);
    setMessage("");
    try {
      const result = await shareBackupFile(t("data.exportAction"), scope);
      setMessage(result === "shared" ? t("data.exportReady") : t("data.exportUnavailable"));
    } catch {
      setMessage(t("data.exportError"));
    } finally {
      setWorking(false);
    }
  };

  const chooseBackupFile = async () => {
    setWorking(true);
    setMessage("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/json", "public.json"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      setPending(await new File(result.assets[0].uri).text());
    } catch {
      setMessage(t("data.importReadError"));
    } finally {
      setWorking(false);
    }
  };

  const closeImport = () => { setPending(null); setConfirmReplace(false); };

  const confirmImport = async (mode: ImportMode) => {
    const contents = pending;
    closeImport();
    if (contents === null) return;
    setWorking(true);
    try {
      await importBackup(contents, mode);
      setMessage(t("data.importSuccess"));
    } catch {
      setMessage(t("data.importInvalid"));
    } finally {
      setWorking(false);
    }
  };

  return (
    <Screen>
      <PageHeading title={t("data.title")} subtitle={t("data.subtitle")} />

      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: palette.surfaceMuted }]}>
          <Icon name="share-outline" size={20} color={palette.accentStrong} />
        </View>
        <Heading>{t("data.exportTitle")}</Heading>
        <Body>{t("data.exportBody")}</Body>
        <ActionButton label={working ? t("data.working") : t("data.exportAction")} disabled={working} onPress={() => void createBackupFile()} />
        <ActionButton icon="calendar-outline" label={t("data.exportRange")} secondary disabled={working} onPress={() => setRangeOpen(true)} />
        <ActionButton icon="barbell-outline" label={t("data.exportLibrary")} secondary disabled={working} onPress={() => void createBackupFile({ kind: "library" })} />
      </Card>

      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: palette.surfaceMuted }]}>
          <Icon name="download-outline" size={20} color={palette.accentStrong} />
        </View>
        <Heading>{t("data.importTitle")}</Heading>
        <Body>{t("data.importBody")}</Body>
        <ActionButton label={working ? t("data.working") : t("data.importAction")} secondary disabled={working} onPress={() => void chooseBackupFile()} />
      </Card>

      {message ? <Body accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Body> : null}
      <Body style={{ color: palette.warning }}>{t("data.privacy")}</Body>
      <Body>{t("data.videoBackupBoundary")}</Body>

      <Card style={[styles.card, { borderColor: palette.warning }]}>
        <View style={[styles.icon, { backgroundColor: palette.surfaceMuted }]}>
          <Icon name="refresh-circle-outline" size={20} color={palette.warning} />
        </View>
        <Heading>{t("reset.cardTitle")}</Heading>
        <Body>{t("reset.cardBody")}</Body>
        <ActionButton icon="trash-outline" label={t("reset.open")} variant="danger" disabled={working} onPress={() => router.push("/reset")} />
      </Card>

      <Sheet
        visible={pending !== null}
        onClose={closeImport}
        title={confirmReplace ? t("data.replaceTitle") : t("data.importModeTitle")}
        body={confirmReplace ? t("data.replaceBody") : t("data.importModeBody")}
      >
        {confirmReplace ? (
          <ActionButton icon="download-outline" label={t("data.replaceAction")} variant="danger" onPress={() => void confirmImport("replace")} />
        ) : (
          <>
            <ActionButton icon="git-merge-outline" label={t("data.mergeAction")} onPress={() => void confirmImport("merge")} />
            <ActionButton icon="swap-horizontal-outline" label={t("data.replaceChoice")} secondary onPress={() => setConfirmReplace(true)} />
          </>
        )}
        <ActionButton label={t("data.cancel")} secondary onPress={closeImport} />
      </Sheet>

      <Sheet visible={rangeOpen} onClose={() => setRangeOpen(false)} title={t("data.rangeTitle")} body={t("data.rangeBody")}>
        <View style={styles.presets}>
          {[7, 30, 90, 365].map((days) => (
            <Chip
              key={days}
              label={t("data.rangeLastDays", { count: days })}
              selected={toDaysAgo === 0 && fromDaysAgo === days - 1}
              onPress={() => { setFromDaysAgo(days - 1); setToDaysAgo(0); }}
            />
          ))}
        </View>
        <Stepper
          layout="row"
          label={t("data.rangeFrom")}
          // Counted back from today, so "+" moves later.
          value={-fromDaysAgo}
          display={formatDay(fromDaysAgo)}
          min={-3650}
          max={-toDaysAgo}
          onChange={(next) => setFromDaysAgo(-next)}
        />
        <Stepper
          layout="row"
          label={t("data.rangeTo")}
          value={-toDaysAgo}
          display={formatDay(toDaysAgo)}
          min={-fromDaysAgo}
          max={0}
          onChange={(next) => setToDaysAgo(-next)}
        />
        <ActionButton
          icon="share-outline"
          label={t("data.exportAction")}
          onPress={() => void createBackupFile({ kind: "workouts", from: dayAt(fromDaysAgo, false), to: dayAt(toDaysAgo, true) })}
        />
        <ActionButton label={t("data.cancel")} secondary onPress={() => setRangeOpen(false)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  card: { padding: 20, gap: 14 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
