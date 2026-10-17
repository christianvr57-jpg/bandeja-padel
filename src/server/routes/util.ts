import type { Context } from 'hono';
import { badRequest } from '../lib/http';

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw badRequest('El cuerpo de la petición no es JSON válido.');
  }
}
