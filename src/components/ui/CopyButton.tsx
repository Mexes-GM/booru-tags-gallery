import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../../utils/copyUtils';
import { cn } from '../../utils/cn';

interface CopyButtonProps {
  /** Text to copy; underscores become spaces in copyToClipboard. */
  text: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * The one action on a card. Slate Wash at rest so it can repeat across the
 * grid; turns Deep Forest for a moment to confirm the copy.
 */
const CopyButton: React.FC<CopyButtonProps> = ({ text, label, size = 'md', className }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyToClipboard(text);
    setState(ok ? 'copied' : 'error');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setState('idle'), 1500);
  }, [text]);

  const copied = state === 'copied';
  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={(e) => e.stopPropagation()}
      aria-live="polite"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
        copied
          ? 'bg-primary text-primary-foreground'
          : state === 'error'
            ? 'bg-destructive-soft text-destructive-text'
            : 'bg-secondary text-secondary-foreground hover:bg-muted',
        className
      )}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
      <span>
        {copied ? t('ui.copied') : state === 'error' ? t('clipboard.copyFail') : (label ?? t('ui.copy'))}
      </span>
    </button>
  );
};

export default CopyButton;
