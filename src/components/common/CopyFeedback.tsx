import React, { useEffect, useState } from 'react';

interface CopyFeedbackState {
  show: boolean;
  text: string;
  success: boolean;
}

/**
 * Componente global que muestra un toast temporal cuando se copia texto
 * Escucha el evento personalizado 'tagTextCopied' disparado por copyUtils
 */
const CopyFeedback: React.FC = () => {
  const [state, setState] = useState<CopyFeedbackState>({ show: false, text: '', success: true });
  const [timeoutId, setTimeoutId] = useState<number | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const { text, success } = detail as { text?: string; success?: boolean };
      if (!text) return;
      setState({ show: true, text, success: success !== false });
      if (timeoutId) window.clearTimeout(timeoutId);
      const id = window.setTimeout(() => setState(prev => ({ ...prev, show: false })), 1400);
      setTimeoutId(id);
    };
    window.addEventListener('tagTextCopied', handler as EventListener);
    return () => {
      window.removeEventListener('tagTextCopied', handler as EventListener);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [timeoutId]);

  if (!state.show) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[12000] px-4 py-2 rounded-full shadow-lg text-sm font-medium backdrop-blur bg-white/80 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 flex items-center gap-2 animate-fade-in"
      role="status"
      aria-live="polite"
    >
      <span
  className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${state.success ? 'status-success-bg' : 'status-danger-bg'}`}
      >
        {state.success ? '✓' : '!'}
      </span>
      <span className="max-w-[260px] truncate text-gray-800 dark:text-slate-100">
        {state.success ? 'Copiado: ' : 'Error al copiar: '}{state.text.replace(/_/g, ' ')}
      </span>
    </div>
  );
};

export default CopyFeedback;
