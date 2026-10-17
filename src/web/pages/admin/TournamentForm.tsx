import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { AdminTournament } from '@shared/api';
import { addDays, TIMEZONES } from '@shared/time';
import { Alert, Button, Card, Checkbox, Field, Input, Select, Textarea } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { resizeImage } from '../../lib/util';

export interface TournamentBody {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  venue: string;
  address: string;
  timezone: string;
  priceCents: number;
  registrationDeadline: string | null;
  rules: string;
  image: string | null;
  matchDurationMin: number;
  contactEmail: string;
  contactPhone: string;
  registrationOpen: boolean;
  courts: Array<{ id?: string; name: string }>;
}

function initial(t?: AdminTournament) {
  const start = addDays(new Date().toISOString().slice(0, 10), 21);
  return {
    name: t?.name ?? '',
    description: t?.description ?? '',
    startDate: t?.startDate ?? start,
    endDate: t?.endDate ?? addDays(start, 1),
    venue: t?.venue ?? '',
    address: t?.address ?? '',
    timezone: t?.timezone ?? 'Europe/Madrid',
    price: t ? String(t.priceCents / 100).replace('.', ',') : '20',
    registrationDeadline: t?.registrationDeadlineLocal ?? `${addDays(start, -2)}T23:59`,
    rules: t?.rules ?? '',
    image: t?.image ?? null,
    matchDurationMin: String(t?.matchDurationMin ?? 90),
    contactEmail: t?.contactEmail ?? '',
    contactPhone: t?.contactPhone ?? '',
    registrationOpen: t?.registrationOpenSetting ?? true,
    courts: (t?.courts.map((c) => ({ id: c.id, name: c.name })) ?? [{ name: 'Pista 1' }, { name: 'Pista 2' }]) as Array<{
      id?: string;
      name: string;
    }>,
  };
}

export function TournamentForm({
  tournament,
  onSubmit,
  pending,
  error,
  submitLabel,
}: {
  tournament?: AdminTournament;
  onSubmit: (body: TournamentBody) => void;
  pending: boolean;
  error: Error | null;
  submitLabel: string;
}) {
  const [v, setV] = useState(() => initial(tournament));
  const [imageError, setImageError] = useState('');
  const fields = error instanceof ApiError ? error.fields : {};
  const set = <K extends keyof typeof v>(k: K) => (value: (typeof v)[K]) => setV((s) => ({ ...s, [k]: value }));
  const priceCents = Math.round(Number(v.price.replace(',', '.')) * 100);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: v.name,
      description: v.description,
      startDate: v.startDate,
      endDate: v.endDate,
      venue: v.venue,
      address: v.address,
      timezone: v.timezone,
      priceCents: Number.isFinite(priceCents) ? priceCents : -1,
      registrationDeadline: v.registrationDeadline || null,
      rules: v.rules,
      image: v.image,
      matchDurationMin: Number(v.matchDurationMin) || 90,
      contactEmail: v.contactEmail,
      contactPhone: v.contactPhone,
      registrationOpen: v.registrationOpen,
      courts: v.courts.map((c) => ({ ...c, name: c.name.trim() })).filter((c) => c.name),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Card className="space-y-4 p-5">
        <p className="font-semibold text-slate-900">Datos básicos</p>
        <Field label="Nombre del torneo" htmlFor="t-name" error={fields.name} required>
          <Input id="t-name" value={v.name} onChange={(e) => set('name')(e.target.value)} invalid={!!fields.name} placeholder="Open de Otoño" />
        </Field>
        <Field label="Descripción" htmlFor="t-desc" hint="Qué incluye, premios, ambiente… Aparece en la página pública.">
          <Textarea id="t-desc" value={v.description} onChange={(e) => set('description')(e.target.value)} rows={3} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha de inicio" htmlFor="t-start" error={fields.startDate} required>
            <Input id="t-start" type="date" value={v.startDate} onChange={(e) => set('startDate')(e.target.value)} />
          </Field>
          <Field label="Fecha de fin" htmlFor="t-end" error={fields.endDate} required>
            <Input id="t-end" type="date" value={v.endDate} min={v.startDate} onChange={(e) => set('endDate')(e.target.value)} invalid={!!fields.endDate} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Precio por pareja (€)" htmlFor="t-price" error={fields.priceCents} hint="0 = gratis. El cobro lo gestiona el club.">
            <Input id="t-price" inputMode="decimal" value={v.price} onChange={(e) => set('price')(e.target.value)} />
          </Field>
          <Field label="Fin de inscripciones" htmlFor="t-deadline" error={fields.registrationDeadline} hint="Hora local del torneo.">
            <Input id="t-deadline" type="datetime-local" value={v.registrationDeadline} onChange={(e) => set('registrationDeadline')(e.target.value)} />
          </Field>
        </div>
        <Checkbox
          checked={v.registrationOpen}
          onChange={set('registrationOpen')}
          label="Inscripciones abiertas (desmárcalo para cerrarlas antes de la fecha límite)"
        />
      </Card>

      <Card className="space-y-4 p-5">
        <p className="font-semibold text-slate-900">Sede y pistas</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sede" htmlFor="t-venue">
            <Input id="t-venue" value={v.venue} onChange={(e) => set('venue')(e.target.value)} placeholder="Club de Pádel…" />
          </Field>
          <Field label="Dirección" htmlFor="t-address" hint="Se enlaza a Google Maps.">
            <Input id="t-address" value={v.address} onChange={(e) => set('address')(e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Zona horaria" htmlFor="t-tz">
            <Select id="t-tz" value={v.timezone} onChange={(e) => set('timezone')(e.target.value)}>
              {Object.entries(TIMEZONES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duración de cada partido (min)" htmlFor="t-dur" error={fields.matchDurationMin} hint="Para programar y detectar solapes.">
            <Input id="t-dur" type="number" min={20} max={240} step={5} value={v.matchDurationMin} onChange={(e) => set('matchDurationMin')(e.target.value)} />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Pistas disponibles</p>
          <div className="space-y-2">
            {v.courts.map((c, i) => (
              <div key={c.id ?? `new-${i}`} className="flex gap-2">
                <Input
                  value={c.name}
                  aria-label={`Pista ${i + 1}`}
                  onChange={(e) => set('courts')(v.courts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                />
                <Button
                  variant="ghost"
                  aria-label="Quitar pista"
                  disabled={v.courts.length <= 1}
                  onClick={() => set('courts')(v.courts.filter((_, j) => j !== i))}
                  icon={<Trash2 className="size-4" />}
                />
              </div>
            ))}
          </div>
          {fields.courts && <p className="mt-1 text-sm text-red-600">{fields.courts}</p>}
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            icon={<Plus className="size-4" />}
            onClick={() => set('courts')([...v.courts, { name: `Pista ${v.courts.length + 1}` }])}
          >
            Añadir pista
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <p className="font-semibold text-slate-900">Imagen, reglamento y contacto</p>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Imagen de portada</p>
          {v.image ? (
            <div className="relative overflow-hidden rounded-xl">
              <img src={v.image} alt="Portada" className="aspect-[3/1] w-full object-cover" />
              <button
                type="button"
                onClick={() => set('image')(null)}
                className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-slate-700 shadow hover:bg-white"
                aria-label="Quitar imagen"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-sm text-slate-500 hover:border-court-400 hover:text-court-700">
              <ImagePlus className="size-6" />
              Subir imagen (JPG, PNG o WebP)
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    setImageError('');
                    set('image')(await resizeImage(file));
                  } catch (err) {
                    setImageError(err instanceof Error ? err.message : 'Imagen no válida');
                  }
                }}
              />
            </label>
          )}
          {(imageError || fields.image) && <p className="mt-1 text-sm text-red-600">{imageError || fields.image}</p>}
        </div>
        <Field label="Reglamento" htmlFor="t-rules" hint="Normas del torneo: formato, puntualidad, bolas…">
          <Textarea id="t-rules" value={v.rules} onChange={(e) => set('rules')(e.target.value)} rows={5} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email de contacto" htmlFor="t-cemail" error={fields.contactEmail} hint="Público, para dudas de los jugadores.">
            <Input id="t-cemail" type="email" value={v.contactEmail} onChange={(e) => set('contactEmail')(e.target.value)} invalid={!!fields.contactEmail} />
          </Field>
          <Field label="Teléfono de contacto" htmlFor="t-cphone" error={fields.contactPhone} hint="Público.">
            <Input id="t-cphone" type="tel" value={v.contactPhone} onChange={(e) => set('contactPhone')(e.target.value)} invalid={!!fields.contactPhone} />
          </Field>
        </div>
      </Card>

      {error && <Alert tone="error">{error.message}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
