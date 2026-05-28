import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

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

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ru: { translation: ru },
      es: { translation: es },
      pt: { translation: pt },
      de: { translation: de },
      fr: { translation: fr },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    detection: {
      // Check localStorage first (user's saved preference), then browser language
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export async function changeLanguage(code) {
  await i18n.changeLanguage(code);
  localStorage.setItem(LANGUAGE_KEY, code);
}

export default i18n;
