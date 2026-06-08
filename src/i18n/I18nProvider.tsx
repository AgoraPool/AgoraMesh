import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import cs from './cs.json';
import en from './en.json';
import type { LanguageCode } from '../types/domain';

type Messages = Record<string, string>;

const resources: Record<LanguageCode, Messages> = { en, cs };

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function readInitialLanguage(): LanguageCode {
  const stored = localStorage.getItem('agoramesh.language');
  return stored === 'cs' ? 'cs' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  const [language, setLanguageState] = useState<LanguageCode>(readInitialLanguage);

  const value = useMemo<I18nContextValue>(() => {
    const setLanguage = (next: LanguageCode): void => {
      localStorage.setItem('agoramesh.language', next);
      document.documentElement.lang = next;
      setLanguageState(next);
    };

    return {
      language,
      setLanguage,
      t: (key: string) => resources[language][key] ?? resources.en[key] ?? key
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider.');
  }
  return context;
}
