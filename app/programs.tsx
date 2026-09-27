import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "../src/shared/components/Text";
import { programTemplates } from "../src/features/programs/catalog";
import { ActionButton, Body, Card, Label, PageHeading, Screen, Icon } from "../src/shared/components/ui";
import i18n from "../src/shared/i18n";
import { useTheme } from "../src/shared/theme/ThemeProvider";
import { useScaledStyles } from "../src/shared/theme/useScaledStyles";

export default function ProgramsScreen() {
  const styles = useScaledStyles(baseStyles);
  const { palette } = useTheme();
  const language = i18n.language.startsWith("it") ? "it" : "en";

  return (
    <Screen>
      <PageHeading
        title={language === "it" ? "Routine settimanali" : "Weekly routines"}
        subtitle={language === "it"
          ? "Scegli una struttura adatta ai tuoi obiettivi e registra ogni sessione."
          : "Choose a structure that fits your goals, then log each session."}
      />
      <ActionButton
        label={language === "it" ? "Crea la tua routine" : "Build your own routine"}
        onPress={() => router.push("/program-builder")}
      />
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
