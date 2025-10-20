import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/translation.json';
import fr from './locales/fr/translation.json';
import de from './locales/de/translation.json';
import es from './locales/es/translation.json';
import it from './locales/it/translation.json';
import ptBR from './locales/pt-BR/translation.json';
import pl from './locales/pl/translation.json';
import tr from './locales/tr/translation.json';
import ru from './locales/ru/translation.json';
import zhCN from './locales/zh-CN/translation.json';
import ja from './locales/ja/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      de: { translation: de },
      es: { translation: es },
      it: { translation: it },
      'pt-BR': { translation: ptBR },
      pl: { translation: pl },
      tr: { translation: tr },
      ru: { translation: ru },
      'zh-CN': { translation: zhCN },
      ja: { translation: ja },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
