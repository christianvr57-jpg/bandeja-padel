import type { z } from 'zod';

/** Error con código HTTP que la API transforma en `{ error: { message, fields? } }`. */
export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) => new HttpError(400, message, fields);
export const notFound = (message = 'No encontrado.') => new HttpError(404, message);
export const conflict = (message: string, fields?: Record<string, string>) => new HttpError(409, message, fields);

/** Valida con zod y devuelve errores por campo ("player1.dni": "La letra…"). */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = Object.values(fields)[0];
  throw badRequest(first && Object.keys(fields).length === 1 ? first : 'Revisa los datos del formulario.', fields);
}
