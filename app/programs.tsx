import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../src/shared/components/Text";
import { programTemplates } from "../src/features/programs/catalog";
import { listUserPrograms, type UserProgram } from "../src/features/programs/userPrograms";
import { sortByWeekday, weekdayKey } from "../src/domain/userProgram";
import { ActionButton, Body, Card, Label, ListGroup, ListRow, PageHeading, Screen, SectionTitle, Icon } from "../src/shared/components/ui";
import i18n from "../src/shared/i18n";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { useScaledStyles } from "../src/shared/theme/useScaledStyles";

export default function ProgramsScreen() {
  const styles = useScaledStyles(baseStyles);
  const { t } = useTranslation();
  const { palette } = useTheme();
  const language = i18n.language.startsWith("it") ? "it" : "en";
  const [mine, setMine] = useState<UserProgram[]>([]);

  useFocusEffect(useCallback(() => {
    let mounted = true;
    void listUserPrograms().then((programs) => { if (mounted) setMine(programs); });
    return () => { mounted = false; };
  }, []));

  return (
    <Screen>
      <PageHeading
        title={language === "it" ? "Routine settimanali" : "Weekly routines"}
        subtitle={language === "it"
          ? "Scegli una struttura adatta ai tuoi obiettivi e registra ogni sessione."
          : "Choose a structure that fits your goals, then log each session."}
      />

      <SectionTitle title={t("userProgram.myPrograms")} />
      {mine.length > 0 ? (
        <ListGroup>
          {mine.map((program) => (
            <ListRow
              key={program.id}
              icon="calendar-outline"
              title={program.name}
              subtitle={sortByWeekday(program.sessions).map((session) => t(`reminders.weekdaysShort.${weekdayKey(session.weekday)}`)).join(" · ")}
              onPress={() => router.push({ pathname: "/program/user/[id]", params: { id: program.id } })}
            />
          ))}
        </ListGroup>
      ) : (
        <Body>{t("userProgram.myProgramsEmpty")}</Body>
      )}
      <ActionButton icon="add" label={t("userProgram.create")} secondary onPress={() => router.push("/program-builder")} />

      <SectionTitle title={t("userProgram.templates")} />
      {programTemplates.map((program) => (
        <Pressable key={program.id} accessibilityRole="button" onPress={() => router.push({ pathname: "/program/[id]", params: { id: program.id } })}>
          <Card style={styles.card}>
            <View style={styles.topline}>
                            <Label style={{ color: palette.accentStrong }}>{program.frequency[language]}</Label>
            </View>
            <Text style={[styles.title, { color: palette.text }]}>{program.name[language]}</Text>
            <Body>{program.summary[language]}</Body>
            <View style={styles.actionRow}><Text style={[styles.action, { color: palette.accentStrong }]}>{language === "it" ? "Vedi routine" : "View routine"}</Text><Icon name="chevron-forward" size={16} color={palette.accentStrong} /></View>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

const baseStyles = StyleSheet.create({
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 2 },
  card: { gap: 12 },
  topline: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 21, fontWeight: "800", letterSpacing: -0.5 },
  action: { fontSize: 15, fontWeight: "600" },
});
