import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ActionButton, Body, Card, Heading, PageHeading, Screen, Icon } from "../src/shared/components/ui";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { exportBackup, importBackup } from "../src/features/data/backup";
import { useScaledStyles } from "../src/shared/theme/useScaledStyles";

export default function DataScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const createBackupFile = async () => {
    setWorking(true);
    setMessage("");
    try {
      const contents = await exportBackup();
      const filename = `trackitbetter-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const file = new File(Paths.cache, filename);
      await file.create({ overwrite: true });
      await file.write(contents);

      if (!(await Sharing.isAvailableAsync())) {
        setMessage(t("data.exportUnavailable"));
        return;
      }

      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: t("data.exportAction"),
        UTI: "public.json",
      });
      setMessage(t("data.exportReady"));
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

      const file = new File(result.assets[0].uri);
      const contents = await file.text();
      Alert.alert(
        t("data.replaceTitle"),
        t("data.replaceBody"),
        [
          { text: t("data.cancel"), style: "cancel" },
          {
            text: t("data.replaceAction"),
            style: "destructive",
            onPress: () => {
              setWorking(true);
              void importBackup(contents).then(
                () => setMessage(t("data.importSuccess")),
                () => setMessage(t("data.importInvalid")),
              ).finally(() => setWorking(false));
            },
          },
        ],
        { cancelable: true },
      );
    } catch {
      setMessage(t("data.importReadError"));
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
        <ActionButton label={working ? t("data.working") : t("data.exportAction")} onPress={() => void createBackupFile()} />
      </Card>

      <Card style={styles.card}>
        <View style={[styles.icon, { backgroundColor: palette.surfaceMuted }]}>
          <Icon name="download-outline" size={20} color={palette.accentStrong} />
        </View>
        <Heading>{t("data.importTitle")}</Heading>
        <Body>{t("data.importBody")}</Body>
        <ActionButton label={working ? t("data.working") : t("data.importAction")} secondary onPress={() => void chooseBackupFile()} />
      </Card>

      {message ? <Body accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Body> : null}
      <Body style={{ color: palette.warning }}>{t("data.privacy")}</Body>
      <Body>{t("data.videoBackupBoundary")}</Body>
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  card: { padding: 20, gap: 14 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
