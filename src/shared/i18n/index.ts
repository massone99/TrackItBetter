import i18n, { changeLanguage } from "i18next";
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

// `use` is the i18next plugin method, not React's hook, so it is called on the instance.
// eslint-disable-next-line import/no-named-as-default-member
void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setAppLanguage(language: "en" | "it") {
  writePreference(LANGUAGE_KEY, language);
  return changeLanguage(language);
}

export default i18n;
