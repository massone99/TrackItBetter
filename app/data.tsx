import { useState } from "react";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { ActionButton, Body, Card, Heading, Icon, PageHeading, Screen, Sheet } from "../src/shared/components/ui";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { importBackup } from "../src/features/data/backup";
import { shareBackupFile } from "../src/features/data/shareBackup";
import { useScaledStyles } from "../src/shared/theme/useScaledStyles";

export default function DataScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  // Contents of a picked backup, waiting for the user to confirm the replacement.
  const [pending, setPending] = useState<string | null>(null);

  const createBackupFile = async () => {
    setWorking(true);
    setMessage("");
    try {
      const result = await shareBackupFile(t("data.exportAction"));
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

  const confirmImport = async () => {
    const contents = pending;
    setPending(null);
    if (contents === null) return;
    setWorking(true);
    try {
      await importBackup(contents);
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

      <Sheet visible={pending !== null} onClose={() => setPending(null)} title={t("data.replaceTitle")} body={t("data.replaceBody")}>
        <ActionButton icon="download-outline" label={t("data.replaceAction")} variant="danger" onPress={() => void confirmImport()} />
        <ActionButton label={t("data.cancel")} secondary onPress={() => setPending(null)} />
      </Sheet>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  card: { padding: 20, gap: 14 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
