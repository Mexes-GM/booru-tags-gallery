import React from 'react';
import { useTranslation } from 'react-i18next';

interface NSFWBlockedMessageProps {
  postId?: number;
  className?: string;
}

export const NSFWBlockedMessage: React.FC<NSFWBlockedMessageProps> = ({ postId, className = '' }) => {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-col items-center justify-center p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg w-full h-full ${className}`}>
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="font-semibold">{t('nsfw.blocked')}</span>
      </div>
      <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
        </svg>
        <span>{t('nsfw.blockedDescription')}</span>
      </div>
      {postId && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Post #{postId}</div>}
    </div>
  );
};

export default NSFWBlockedMessage;
