import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import { readPreference, writePreference } from "../settings/preferences";
import { resources } from "./resources";

const LANGUAGE_KEY = "appearance.language";
const storedLanguage = readPreference(LANGUAGE_KEY);
const deviceLanguage = getLocales()[0]?.languageCode;
const initialLanguage = storedLanguage === "it" || storedLanguage === "en"
  ? storedLanguage
  : deviceLanguage === "it" ? "it" : "en";

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setAppLanguage(language: "en" | "it") {
  writePreference(LANGUAGE_KEY, language);
  return i18n.changeLanguage(language);
}

export default i18n;
