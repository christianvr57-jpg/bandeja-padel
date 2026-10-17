import { CheckCircle2, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Button, cx, Modal } from './ui';

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackApi {
  toast: (message: string, tone?: 'success' | 'error') => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const counter = useRef(0);

  const toast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = ++counter.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  const close = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-auto sm:top-16">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg',
              t.tone === 'success' ? 'bg-court-950 text-white' : 'bg-red-600 text-white',
            )}
          >
            {t.tone === 'success' ? <CheckCircle2 className="size-4 text-ball-400" /> : <XCircle className="size-4" />}
            {t.message}
          </div>
        ))}
      </div>
      <Modal
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {pending?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="text-sm leading-relaxed text-slate-700">{pending?.message}</div>
      </Modal>
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('FeedbackProvider no encontrado');
  return ctx;
}

/** Mensaje legible de un error de la API. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Algo ha fallado. Inténtalo de nuevo.';
}
