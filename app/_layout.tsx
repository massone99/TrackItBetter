import "../src/shared/i18n";
import "../src/features/reminders/notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardRoot } from "../src/shared/components/keyboard";
import { ActionButton, Body, Card, Heading, Screen } from "../src/shared/components/ui";
import { initializeDatabase } from "../src/db/client";
import { ThemeProvider, useTheme } from "../src/shared/theme/ThemeProvider";
import { fontAssets } from "../src/shared/theme/typography";
import { useTranslation } from "react-i18next";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppNavigator() {
  const { mode, palette } = useTheme();
  const { t } = useTranslation();
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [retry, setRetry] = useState(0);
  const [databaseResult, setDatabaseResult] = useState<{ attempt: number; status: "ready" | "error" } | null>(null);

  useEffect(() => {
    let isCurrentAttempt = true;
    void initializeDatabase().then(
      () => { if (isCurrentAttempt) setDatabaseResult({ attempt: retry, status: "ready" }); },
      (error: unknown) => {
        console.error("Database initialization failed", error);
        if (isCurrentAttempt) setDatabaseResult({ attempt: retry, status: "error" });
      },
    );
    return () => { isCurrentAttempt = false; };
  }, [retry]);

  const databaseState = databaseResult?.attempt === retry ? databaseResult.status : "loading";
  const ready = (fontsLoaded || Boolean(fontError)) && databaseState !== "loading";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: palette.background }} />;

  if (databaseState !== "ready") {
    return (
      <>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        <Screen contentContainerStyle={{ flex: 1, justifyContent: "center" }}>
          <Card>
            <Heading>{databaseState === "loading" ? t("startup.loadingTitle") : t("startup.errorTitle")}</Heading>
            <Body>{databaseState === "loading" ? t("startup.loadingBody") : t("startup.errorBody")}</Body>
            {databaseState === "error" ? <ActionButton label={t("startup.retry")} onPress={() => setRetry((value) => value + 1)} /> : null}
          </Card>
        </Screen>
      </>
    );
  }

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background }, animation: "slide_from_right" }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="workout/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="micro-session" />
        <Stack.Screen name="form-check/[setId]" />
        <Stack.Screen name="workout/summary/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="workout/history/[id]" />
        <Stack.Screen name="workout/share/[id]" />
        <Stack.Screen name="exercise/[id]" />
        <Stack.Screen name="exercise/new" />
        <Stack.Screen name="skill/[chainId]" />
        <Stack.Screen name="program/[id]" />
        <Stack.Screen name="program/user/[id]" />
        <Stack.Screen name="programs" />
        <Stack.Screen name="program-builder" />
        <Stack.Screen name="bodyweight" />
        <Stack.Screen name="data" />
        <Stack.Screen name="reset" options={{ gestureEnabled: false }} />
        <Stack.Screen name="reminders" />
        <Stack.Screen name="photos" />
        <Stack.Screen name="measurements" />
        <Stack.Screen name="mobility/index" />
        <Stack.Screen name="mobility/tests" />
        <Stack.Screen name="mobility/routine/[id]" />
        <Stack.Screen name="mobility/play/[id]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="pose/index" />
        <Stack.Screen name="pose/new" />
        <Stack.Screen name="pose/[positionId]" />
        <Stack.Screen name="goals" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardRoot>
        {/* Known insets on the first frame, so headers never start under the status bar. */}
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>
            <AppNavigator />
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardRoot>
    </GestureHandlerRootView>
  );
}
