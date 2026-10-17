import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Link, type LinkProps } from 'react-router';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-court-900 text-white hover:bg-court-800 shadow-sm',
  accent: 'bg-ball-400 text-court-950 hover:bg-ball-300 shadow-sm',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 shadow-xs',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  'danger-ghost': 'text-red-700 hover:bg-red-50',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cx(
    'inline-flex items-center justify-center font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap',
    variants[variant],
    sizes[size],
    extra,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  variant = 'primary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
  required,
  className,
}: {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  'block w-full rounded-xl border bg-white px-3.5 text-base sm:text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-court-500/40 disabled:bg-slate-100 disabled:text-slate-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cx(inputBase, 'h-11', invalid ? 'border-red-400' : 'border-slate-300 focus:border-court-500', className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cx(inputBase, 'py-2.5 min-h-24', invalid ? 'border-red-400' : 'border-slate-300 focus:border-court-500', className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cx(inputBase, 'h-11 pr-8', invalid ? 'border-red-400' : 'border-slate-300 focus:border-court-500', className)}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export function Checkbox({
  label,
  checked,
  onChange,
  invalid,
  id,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  invalid?: boolean;
  id?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label htmlFor={inputId} className="flex items-start gap-3 text-sm text-slate-700 cursor-pointer">
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={cx('mt-0.5 size-5 shrink-0 rounded accent-court-900', invalid && 'outline outline-2 outline-red-400')}
      />
      <span>{label}</span>
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl border border-slate-200 bg-white shadow-xs', className)}>{children}</div>;
}

type Tone = 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'lime' | 'violet';
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-court-50 text-court-800 ring-court-200',
  lime: 'bg-ball-100 text-ball-600 ring-ball-300',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
};

export function Badge({ tone = 'slate', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('size-5 animate-spin text-court-700', className)} aria-label="Cargando" />;
}

export function PageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500">
      <Spinner className="size-7" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: ['bg-court-50 border-court-200 text-court-900', Info],
    success: ['bg-emerald-50 border-emerald-200 text-emerald-900', CheckCircle2],
    warning: ['bg-amber-50 border-amber-200 text-amber-900', AlertTriangle],
    error: ['bg-red-50 border-red-200 text-red-900', XCircle],
  } as const;
  const [cls, Icon] = styles[tone];
  return (
    <div className={cx('flex gap-3 rounded-xl border p-3.5 text-sm', cls, className)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-court-50 text-court-700">{icon}</div>}
      <p className="font-semibold text-slate-900">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Algo ha fallado.';
  return (
    <div className="mx-auto max-w-lg py-16">
      <Alert tone="error" title="No se ha podido cargar">
        <p>{message}</p>
        {retry && (
          <Button variant="secondary" size="sm" className="mt-3" onClick={retry}>
            Reintentar
          </Button>
        )}
      </Alert>
    </div>
  );
}

/** Ventana modal: hoja inferior en móvil, centrada en escritorio. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:p-4 sm:pt-[8vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-h-[84vh] sm:rounded-2xl',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="-mr-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Pestañas en forma de píldoras con scroll horizontal (cómodas en móvil). */
export function Pills<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  className?: string;
}) {
  return (
    <div className={cx('scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition-colors',
            value === o.value ? 'bg-court-900 text-white ring-court-900' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
          )}
        >
          {o.label}
          {o.count != null && (
            <span className={cx('rounded-full px-1.5 text-xs', value === o.value ? 'bg-white/20' : 'bg-slate-100 text-slate-600')}>{o.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-slate-500">
        <p className="text-xs font-medium uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-lg font-bold text-slate-900">{children}</h2>
      {action}
    </div>
  );
}
