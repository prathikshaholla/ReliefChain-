'use client';
// ============================================================================
// Toast notifications (replaces window.alert)
// Owner: Member 2 (Full-Stack & NoSQL/Vector Specialist)
// ============================================================================

import { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; type: ToastType; text: string }

const ToastContext = createContext<(text: string, type?: ToastType) => void>(() => {});
let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  const notify = useCallback((text: string, type: ToastType = 'info') => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, type, text }]);
    setTimeout(() => dismiss(id), type === 'error' ? 9000 : 5000);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`alert toast alert-${t.type}`}>
            {t.type === 'success' ? <CheckCircle2 size={18} /> : t.type === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
            <span>{t.text}</span>
            <button className="close" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
