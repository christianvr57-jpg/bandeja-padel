import type { ApiErrorBody } from '@shared/api';

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';
const TOKEN_KEY = 'bandeja.session';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** En la demo no hay cookies reales: el token de sesión se guarda en localStorage. */
export const sessionToken = {
  get: () => (IS_DEMO ? safeStorage(() => localStorage.getItem(TOKEN_KEY)) : null),
  set: (t: string | null) => {
    if (!IS_DEMO) return;
    safeStorage(() => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)));
  },
};

function safeStorage<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

async function send(path: string, init: RequestInit): Promise<Response> {
  if (IS_DEMO) {
    const { demoFetch } = await import('../demo/backend');
    return demoFetch(`/api${path}`, init);
  }
  return fetch(`/api${path}`, { ...init, credentials: 'same-origin' });
}

export async function apiRaw(path: string, opts: { method?: string; body?: unknown } = {}): Promise<Response> {
  const headers: Record<string, string> = { 'x-requested-with': 'bandeja' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const token = sessionToken.get();
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await send(path, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch (err) {
    const message = IS_DEMO && err instanceof Error ? err.message : 'No hay conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    throw new ApiError(0, message);
  }
  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(res.status, body?.error?.message ?? `Error ${res.status}`, body?.error?.fields ?? {});
  }
  return res;
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await apiRaw(path, opts);
  return (await res.json()) as T;
}
