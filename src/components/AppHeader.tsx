import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Moon, Sun } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { useDarkMode } from '../context/useDarkMode';
import { cn } from '../utils/cn';

const LANGUAGES = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'es', label: 'ES', name: 'Español' },
];

const ghostButton =
  'inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

/** Compact top bar: wordmark left, quiet ghost actions right. */
const AppHeader: React.FC = () => {
  const { t, changeLanguage, currentLanguage } = useLanguage();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const activeLang = currentLanguage?.startsWith('es') ? 'es' : 'en';

  return (
    <header className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
      <Link
        to="/"
        className="flex min-w-0 items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-foreground"
      >
        <img src="/favicon.png" alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-full" />
        <span className="truncate">{t('ui.wordmark')}</span>
      </Link>

      <nav className="flex items-center gap-1" aria-label={t('navigation.settings')}>
        <div
          role="group"
          aria-label={t('settings.language')}
          className="flex h-9 items-center rounded-md p-0.5 text-xs font-medium"
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              lang={lang.code}
              aria-pressed={activeLang === lang.code}
              title={lang.name}
              onClick={() => changeLanguage(lang.code)}
              className={cn(
                'h-8 rounded-[6px] px-2 font-mono transition-colors',
                activeLang === lang.code
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={toggleDarkMode}
          aria-label={t('settings.toggleTheme')}
          title={t('settings.toggleTheme')}
          className={cn(ghostButton, 'w-9 justify-center px-0')}
        >
          {isDarkMode ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
        </button>

        <a
          href="https://ko-fi.com/mexes"
          target="_blank"
          rel="noopener noreferrer"
          className={ghostButton}
          aria-label={t('ui.supportOnKofi')}
          title={t('ui.supportOnKofi')}
        >
          <Heart className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{t('ui.support')}</span>
        </a>
      </nav>
    </header>
  );
};

export default AppHeader;
