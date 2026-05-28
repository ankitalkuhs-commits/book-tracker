import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import ru from './locales/ru.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import de from './locales/de.json';
import fr from './locales/fr.json';

const LANGUAGE_KEY = 'tmr_language';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português (BR)' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
];

// Map device locale to a supported language code
function detectLanguage() {
  const deviceLocale = Localization.getLocales()?.[0]?.languageCode ?? 'en';
  const supported = SUPPORTED_LANGUAGES.map((l) => l.code);
  return supported.includes(deviceLocale) ? deviceLocale : 'en';
}

export async function initI18n() {
  let savedLang = null;
  try {
    savedLang = await AsyncStorage.getItem(LANGUAGE_KEY);
  } catch (_) {}

  const lng = savedLang || detectLanguage();

  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, ru: { translation: ru }, es: { translation: es }, pt: { translation: pt }, de: { translation: de }, fr: { translation: fr } },
    lng,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export async function changeLanguage(code) {
  await i18n.changeLanguage(code);
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, code);
  } catch (_) {}
}

export default i18n;
