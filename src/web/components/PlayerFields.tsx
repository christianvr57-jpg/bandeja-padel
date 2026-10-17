import { useId } from 'react';
import { validateEmail, validateSpanishPhone } from '@shared/validation/contact';
import { validateDocument } from '@shared/validation/dni';
import { Field, Input } from './ui';

export interface PlayerForm {
  fullName: string;
  dni: string;
  email: string;
  phone: string;
}

export const emptyPlayer = (): PlayerForm => ({ fullName: '', dni: '', email: '', phone: '' });

/** Validación en el navegador con las mismas funciones que usa el servidor. */
export function validatePlayer(p: PlayerForm, opts: { dniOptional?: boolean } = {}): Partial<Record<keyof PlayerForm, string>> {
  const errors: Partial<Record<keyof PlayerForm, string>> = {};
  const name = p.fullName.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || !name.includes(' ')) errors.fullName = 'Escribe nombre y apellidos.';
  if (!(opts.dniOptional && !p.dni.trim())) {
    const d = validateDocument(p.dni);
    if (!d.valid) errors.dni = d.reason;
  }
  const e = validateEmail(p.email);
  if (!e.valid) errors.email = e.reason;
  const ph = validateSpanishPhone(p.phone);
  if (!ph.valid) errors.phone = ph.reason;
  return errors;
}

export function PlayerFields({
  title,
  value,
  onChange,
  errors,
  onBlurField,
  dniPlaceholder,
  dniHint,
}: {
  title: string;
  value: PlayerForm;
  onChange: (v: PlayerForm) => void;
  errors: Partial<Record<keyof PlayerForm, string>>;
  onBlurField?: (field: keyof PlayerForm) => void;
  dniPlaceholder?: string;
  dniHint?: string;
}) {
  const id = useId();
  const set = (k: keyof PlayerForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const blur = (k: keyof PlayerForm) => () => onBlurField?.(k);
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-sm font-bold uppercase tracking-wide text-court-800">{title}</legend>
      <Field label="Nombre y apellidos" htmlFor={`${id}-name`} error={errors.fullName} required>
        <Input
          id={`${id}-name`}
          autoComplete="off"
          value={value.fullName}
          onChange={set('fullName')}
          onBlur={blur('fullName')}
          invalid={!!errors.fullName}
          placeholder="Nombre Apellido Apellido"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="DNI / NIE" htmlFor={`${id}-dni`} error={errors.dni} hint={dniHint ?? 'Con letra. No se publica.'} required={!dniPlaceholder}>
          <Input
            id={`${id}-dni`}
            autoComplete="off"
            autoCapitalize="characters"
            value={value.dni}
            onChange={set('dni')}
            onBlur={blur('dni')}
            invalid={!!errors.dni}
            placeholder={dniPlaceholder ?? '12345678Z'}
            maxLength={14}
          />
        </Field>
        <Field label="Teléfono" htmlFor={`${id}-phone`} error={errors.phone} hint="Móvil español. No se publica." required>
          <Input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={value.phone}
            onChange={set('phone')}
            onBlur={blur('phone')}
            invalid={!!errors.phone}
            placeholder="612 345 678"
          />
        </Field>
      </div>
      <Field label="Email" htmlFor={`${id}-email`} error={errors.email} hint="Recibirá la confirmación. No se publica." required>
        <Input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="off"
          value={value.email}
          onChange={set('email')}
          onBlur={blur('email')}
          invalid={!!errors.email}
          placeholder="nombre@email.com"
        />
      </Field>
    </fieldset>
  );
}

/** Convierte errores del servidor ("player1.dni") al formato de cada jugador. */
export function serverPlayerErrors(fields: Record<string, string>, prefix: 'player1' | 'player2') {
  const out: Partial<Record<keyof PlayerForm, string>> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith(`${prefix}.`)) out[k.slice(prefix.length + 1) as keyof PlayerForm] = v;
  }
  return out;
}
