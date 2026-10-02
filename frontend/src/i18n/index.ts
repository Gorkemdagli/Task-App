import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { authTranslations } from './auth';
import company from './company';
import landing from './landing';
import teams from './teams';
import tasks from './tasks';
import permissions from './permissions';
import { commonEnglish, commonTurkish } from './common';

export const LANGUAGE_STORAGE_KEY = 'taskflow-language';

function flattenTranslations(values: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(values).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') flat[path] = value;
    else Object.assign(flat, flattenTranslations(value as Record<string, unknown>, path));
    return flat;
  }, {});
}

function readLanguage(): 'tr' | 'en' {
  return localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'tr';
}

i18n.use(initReactI18next).init({
  resources: {
    tr: {
      translation: {
        ...commonTurkish,
        ...flattenTranslations(authTranslations.tr),
        ...flattenTranslations(company.tr),
        ...flattenTranslations(landing.tr),
        ...flattenTranslations(teams.tr),
        ...flattenTranslations(tasks.tr),
        ...flattenTranslations(permissions.tr),
      },
    },
    en: {
      translation: {
        ...commonEnglish,
        ...flattenTranslations(authTranslations.en),
        ...flattenTranslations(company.en),
        ...flattenTranslations(landing.en),
        ...flattenTranslations(teams.en),
        ...flattenTranslations(tasks.en),
        ...flattenTranslations(permissions.en),
      },
    },
  },
  lng: readLanguage(),
  fallbackLng: 'tr',
  supportedLngs: ['tr', 'en'],
  keySeparator: false,
  interpolation: { escapeValue: false },
});

function persistLanguage(language: string) {
  const supportedLanguage = language === 'en' ? 'en' : 'tr';
  localStorage.setItem(LANGUAGE_STORAGE_KEY, supportedLanguage);
  document.documentElement.lang = supportedLanguage;
}

i18n.on('languageChanged', persistLanguage);
document.documentElement.lang = i18n.language === 'en' ? 'en' : 'tr';

export { useTranslation };
export default i18n;
