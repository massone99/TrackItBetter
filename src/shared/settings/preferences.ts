import { Platform } from "react-native";
import Storage from "expo-sqlite/kv-store";

// Synchronous SQLite storage is unavailable at startup on web, so the browser's localStorage is used there.
const webStorage = Platform.OS === "web" && typeof localStorage !== "undefined" ? localStorage : null;

/** Small synchronous key-value preferences (theme, language) that must be known before first render. */
export function readPreference(key: string): string | null {
  try {
    return webStorage ? webStorage.getItem(key) : Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string): void {
  try {
    if (webStorage) webStorage.setItem(key, value);
    else Storage.setItemSync(key, value);
  } catch {
    // Preferences are a convenience; the app keeps working with defaults.
  }
}

export function readBooleanPreference(key: string, fallback: boolean): boolean {
  const value = readPreference(key);
  return value === null ? fallback : value === "true";
}

/** Asks for RPE right after a set is completed (on by default). */
export const RPE_PROMPT_KEY = "workout.rpePrompt";
