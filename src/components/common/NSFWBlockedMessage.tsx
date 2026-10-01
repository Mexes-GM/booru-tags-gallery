import React from 'react';
import { useTranslation } from 'react-i18next';

interface NSFWBlockedMessageProps {
  postId?: number;
  className?: string;
}

export const NSFWBlockedMessage: React.FC<NSFWBlockedMessageProps> = ({ postId, className = '' }) => {
  const { t } = useTranslation();
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg bg-muted/60 p-4 text-center ${className}`}>
      <div className="flex items-center gap-2 text-sm text-foreground">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="font-medium">{t('nsfw.blocked')}</span>
      </div>
      <div className="hidden">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
        </svg>
        <span>{t('nsfw.blockedDescription')}</span>
      </div>
      {postId && <div className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">Post #{postId}</div>}
    </div>
  );
};

export default NSFWBlockedMessage;
