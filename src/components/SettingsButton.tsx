import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import DarkModeToggle from './DarkModeToggle';

interface SettingsButtonProps {
  className?: string;
}

export const SettingsButton: React.FC<SettingsButtonProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { t, changeLanguage, currentLanguage } = useLanguage();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (language: string) => {
    changeLanguage(language);
    setIsOpen(false);
  };

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Botón flotante */}
      <button
        onClick={toggleDropdown}
        className="fixed top-3 right-3 lg:top-4 lg:right-4 z-50 p-2 lg:p-3 bg-surface-alt dark:bg-[var(--color-searchcard)]/80 backdrop-blur-sm rounded-full shadow-lg hover:shadow-xl transition-all duration-200 border border-subtle hover:border-accent/50 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={t('navigation.settings')}
      >
        <svg
          className="w-5 h-5 lg:w-6 lg:h-6 text-text dark:text-text-secondary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Dropdown de opciones */}
      {isOpen && (
  <div className="fixed top-12 right-3 lg:top-16 lg:right-4 z-50 bg-surface dark:bg-[var(--color-searchcard)] rounded-lg shadow-xl border border-subtle min-w-44 lg:min-w-48">
          <div className="p-3 lg:p-4">
            <h3 className="text-xs lg:text-sm font-semibold text-primary mb-3">
              {t('settings.title')}
            </h3>
            
            {/* Sección de modo oscuro */}
            <div className="mb-4">
              <label className="block text-xs lg:text-sm font-medium text-text-secondary mb-2">
                {t('settings.appearance')}
              </label>
              <div className="flex items-center justify-between">
                <span className="text-xs lg:text-sm text-text-secondary">
                  {t('settings.darkMode')}
                </span>
                <DarkModeToggle />
              </div>
            </div>

            {/* Sección de idioma */}
            <div className="mb-4">
              <label className="block text-xs lg:text-sm font-medium text-text-secondary mb-2">
                {t('settings.language')}
              </label>
              <div className="space-y-2">
                <button
                  onClick={() => handleLanguageChange('en')}
                  className={`w-full text-left px-2 lg:px-3 py-1.5 lg:py-2 rounded-md text-xs lg:text-sm transition-colors ${
                    currentLanguage === 'en'
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-surface-alt dark:hover:bg-[var(--color-searchcard)]/50 text-text-secondary'
                  }`}
                >
                  🇺🇸 English
                </button>
                <button
                  onClick={() => handleLanguageChange('es')}
                  className={`w-full text-left px-2 lg:px-3 py-1.5 lg:py-2 rounded-md text-xs lg:text-sm transition-colors ${
                    currentLanguage === 'es'
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : 'hover:bg-surface-alt dark:hover:bg-[var(--color-searchcard)]/50 text-text-secondary'
                  }`}
                >
                  🇪🇸 Español
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsButton;