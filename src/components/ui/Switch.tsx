import React from 'react';
import { cn } from '../../utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  title?: string;
  disabled?: boolean;
  className?: string;
}

/** Labelled on/off switch. The thumb fills with Deep Forest when on. */
const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, title, disabled, className }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    title={title}
    onClick={() => onChange(!checked)}
    className={cn(
      'group inline-flex min-h-8 items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150',
        checked ? 'border-primary bg-primary' : 'border-input bg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-150 ease-out-expo',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </span>
    <span className="whitespace-nowrap">{label}</span>
  </button>
);

export default Switch;
