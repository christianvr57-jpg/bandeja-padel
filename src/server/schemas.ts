import { z } from 'zod';
import { LEVELS } from '../shared/labels';
import { TIMEZONES } from '../shared/time';
import { normalizeName, validateEmail, validateSpanishPhone } from '../shared/validation/contact';
import { validateDocument } from '../shared/validation/dni';

const custom = <T>(fn: (v: string) => { valid: true; value: T } | { valid: false; reason: string }) =>
  z.string({ error: 'Campo obligatorio.' }).transform((v, ctx) => {
    const r = fn(v);
    if (!r.valid) {
      ctx.addIssue({ code: 'custom', message: r.reason });
      return z.NEVER;
    }
    return r.value;
  });

export const emailField = custom(validateEmail);
export const phoneField = custom(validateSpanishPhone);
export const dniField = custom(validateDocument);
export const nameField = z
  .string({ error: 'Campo obligatorio.' })
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(3, 'Escribe nombre y apellidos.')
      .max(80, 'Demasiado largo (máx. 80 caracteres).')
      .refine((v) => v.includes(' '), 'Escribe nombre y apellidos.'),
  );

export const playerSchema = z.object({
  fullName: nameField,
  email: emailField,
  phone: phoneField,
  dni: dniField,
});

export const playerUpdateSchema = z.object({
  fullName: nameField,
  email: emailField,
  phone: phoneField,
  /** Vacío = mantener el DNI actual. */
  dni: z.union([z.literal(''), dniField]).optional(),
});

export const uuidSchema = z.uuid('Identificador no válido.');

export const publicRegistrationSchema = z.object({
  categoryId: uuidSchema,
  player1: playerSchema,
  player2: playerSchema,
  acceptPrivacy: z.literal(true, { error: 'Debes aceptar la política de privacidad.' }),
  /** Honeypot: los humanos no ven este campo. */
  website: z.string().max(200).optional(),
  /** Milisegundos que el formulario estuvo abierto, medidos en el navegador (anti-bots). */
  elapsedMs: z.number().optional(),
});

export const clubRegistrationSchema = z.object({
  categoryId: uuidSchema,
  player1: playerSchema,
  player2: playerSchema,
  paid: z.boolean().optional(),
  notes: z.string().max(500).optional(),
  consentConfirmed: z.literal(true, { error: 'Confirma que los jugadores han aceptado la política de privacidad.' }),
});

export const updateRegistrationPlayersSchema = z.object({
  player1: playerUpdateSchema,
  player2: playerUpdateSchema,
});

export const adminRegistrationPatchSchema = z.object({
  paid: z.boolean().optional(),
  seed: z.number().int().min(1).max(64).nullable().optional(),
  notes: z.string().max(500).optional(),
  categoryId: uuidSchema.optional(),
  player1: playerUpdateSchema.optional(),
  player2: playerUpdateSchema.optional(),
});

export const signupSchema = z.object({
  clubName: z.string().trim().min(2, 'Escribe el nombre del club.').max(80),
  city: z.string().trim().max(80).default(''),
  email: emailField,
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(200),
  acceptTerms: z.literal(true, { error: 'Debes aceptar las condiciones y la política de privacidad.' }),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3, 'Introduce tu email.').max(254),
  password: z.string().min(1, 'Introduce la contraseña.').max(200),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha no válida.');
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Fecha y hora no válidas.');

const imageField = z
  .string()
  .max(700_000, 'La imagen es demasiado grande (máx. ~500 KB).')
  .refine((v) => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || /^https:\/\/\S+$/.test(v), 'Imagen no válida.')
  .nullable();

export const tournamentSchema = z
  .object({
    name: z.string().trim().min(3, 'Escribe el nombre del torneo.').max(100),
    description: z.string().trim().max(2000).default(''),
    startDate: day,
    endDate: day,
    venue: z.string().trim().max(120).default(''),
    address: z.string().trim().max(200).default(''),
    timezone: z.enum(Object.keys(TIMEZONES) as [keyof typeof TIMEZONES]).default('Europe/Madrid'),
    priceCents: z.number().int().min(0).max(100_000).default(0),
    registrationDeadline: localDateTime.nullable().default(null),
    rules: z.string().trim().max(10_000).default(''),
    image: imageField.default(null),
    matchDurationMin: z.number().int().min(20).max(240).default(90),
    contactEmail: z.union([z.literal(''), emailField]).default(''),
    contactPhone: z.union([z.literal(''), phoneField]).default(''),
    registrationOpen: z.boolean().default(true),
    courts: z
      .array(z.object({ id: uuidSchema.optional(), name: z.string().trim().min(1, 'Nombre de pista vacío.').max(40) }))
      .min(1, 'Añade al menos una pista.')
      .max(40),
  })
  .refine((t) => t.endDate >= t.startDate, { message: 'La fecha de fin no puede ser anterior a la de inicio.', path: ['endDate'] });

export const tournamentStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'finished']),
});

export const categorySchema = z.object({
  gender: z.enum(['M', 'F', 'X']),
  level: z.string().trim().min(1).max(30).default(LEVELS[2]),
  name: z.string().trim().max(60).default(''),
  maxPairs: z.number().int().min(2, 'Mínimo 2 parejas.').max(128, 'Máximo 128 parejas.'),
  format: z.enum(['single_elimination', 'consolation', 'groups_knockout', 'americano']),
  matchFormat: z.enum(['best_of_3_super_tb', 'best_of_3', 'single_set', 'games']),
  groupSize: z.number().int().min(3).max(6).default(4),
  qualifiersPerGroup: z.number().int().min(1).max(4).default(2),
});

export const generateDrawSchema = z.object({
  useSeeds: z.boolean().default(true),
});

const slotRef = z.object({ match: z.string().max(20), side: z.enum(['a', 'b']) });
export const swapSchema = z.union([
  z.object({ kind: z.literal('slots'), x: slotRef, y: slotRef }),
  z.object({ kind: z.literal('entries'), x: uuidSchema, y: uuidSchema }),
]);

export const resultSchema = z.object({
  outcome: z.enum(['normal', 'walkover', 'retired']),
  sets: z
    .array(z.object({ a: z.number().int().min(0).max(99), b: z.number().int().min(0).max(99) }))
    .max(3)
    .default([]),
  winner: z.enum(['a', 'b']).nullable().optional(),
});

export const scheduleSchema = z.object({
  courtId: uuidSchema.nullable(),
  scheduledAt: localDateTime.nullable(),
});

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Hora no válida.');
export const autoScheduleSchema = z.object({
  days: z
    .array(z.object({ date: day, from: hhmm, to: hhmm }))
    .min(1, 'Añade al menos un día.')
    .max(14),
  slotMin: z.number().int().min(5).max(240).default(30),
  restMin: z.number().int().min(0).max(240).default(30),
  categoryIds: z.array(uuidSchema).optional(),
  replaceExisting: z.boolean().default(false),
});

export const replaceSchema = z.object({
  replacementId: uuidSchema,
});
