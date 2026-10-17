import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_CLUB, seedIfEmpty } from '@server/seed';
import type { AdminCompetitionView, AdminRegistration, PublicTournamentView } from '@shared/api';
import { fakePlayer, setupApi } from './helpers';

type Api = Awaited<ReturnType<typeof setupApi>>;

const tournamentBody = (over: Record<string, unknown> = {}) => ({
  name: 'Open de Prueba',
  startDate: '2030-05-10',
  endDate: '2030-05-11',
  venue: 'Club Test',
  priceCents: 2500,
  registrationDeadline: '2030-05-08T23:59',
  courts: [{ name: 'Pista 1' }, { name: 'Pista 2' }],
  ...over,
});

const categoryBody = (over: Record<string, unknown> = {}) => ({
  gender: 'M',
  level: '3ª',
  maxPairs: 4,
  format: 'single_elimination',
  matchFormat: 'best_of_3_super_tb',
  ...over,
});

async function signup(api: Api, email: string) {
  const r = await api.call('POST', '/auth/signup', {
    clubName: `Club ${email}`,
    email,
    password: 'contraseña-segura',
    acceptTerms: true,
  });
  expect(r.status).toBe(201);
  return r.json.token as string;
}

async function publishedTournament(api: Api, token: string, cat: Record<string, unknown> = {}) {
  const t = await api.call('POST', '/admin/tournaments', tournamentBody(), { token });
  expect(t.status).toBe(201);
  const c = await api.call('POST', `/admin/tournaments/${t.json.id}/categories`, categoryBody(cat), { token });
  expect(c.status).toBe(201);
  expect((await api.call('PATCH', `/admin/tournaments/${t.json.id}/status`, { status: 'published' }, { token })).status).toBe(200);
  const detail = await api.call('GET', `/admin/tournaments/${t.json.id}`, undefined, { token });
  return { id: t.json.id as string, slug: detail.json.slug as string, categoryId: c.json.id as string };
}

let ipCounter = 1;
const register = (api: Api, slug: string, categoryId: string, p1 = fakePlayer('Ana'), p2 = fakePlayer('Bea'), extra: Record<string, unknown> = {}) =>
  api.call(
    'POST',
    `/public/tournaments/${slug}/registrations`,
    { categoryId, player1: p1, player2: p2, acceptPrivacy: true, elapsedMs: 10_000, ...extra },
    { ip: `10.1.0.${ipCounter++}` },
  );

describe('autenticación de clubes', () => {
  let api: Api;
  beforeAll(async () => {
    api = await setupApi();
  });
  afterAll(() => api.close());

  it('registro, login, sesión y logout', async () => {
    const token = await signup(api, 'club@example.com');
    expect((await api.call('GET', '/auth/me', undefined, { token })).json.club.email).toBe('club@example.com');

    expect((await api.call('POST', '/auth/login', { email: 'club@example.com', password: 'mala' })).status).toBe(401);
    const login = await api.call('POST', '/auth/login', { email: 'CLUB@example.com', password: 'contraseña-segura' });
    expect(login.status).toBe(200);

    await api.call('POST', '/auth/logout', {}, { token: login.json.token });
    expect((await api.call('GET', '/auth/me', undefined, { token: login.json.token })).json.club).toBeNull();
  });

  it('no permite dos clubes con el mismo email', async () => {
    const r = await api.call('POST', '/auth/signup', { clubName: 'Otro', email: 'club@example.com', password: '12345678', acceptTerms: true });
    expect(r.status).toBe(409);
  });

  it('las contraseñas se guardan hasheadas', async () => {
    const rows = await api.db.select().from((await import('@server/db/schema')).clubs);
    for (const r of rows) {
      expect(r.passwordHash).toMatch(/^pbkdf2\$/);
      expect(r.passwordHash).not.toContain('contraseña');
    }
  });

  it('el panel exige sesión', async () => {
    expect((await api.call('GET', '/admin/tournaments')).status).toBe(401);
  });

  it('rechaza peticiones de escritura sin la cabecera anti-CSRF', async () => {
    const r = await api.call('POST', '/auth/login', { email: 'club@example.com', password: 'x' }, { csrf: false });
    expect(r.status).toBe(403);
  });

  it('en modo cookie usa una cookie httpOnly', async () => {
    const cookieApi = await setupApi({ authMode: 'cookie', secureCookies: true });
    const r = await cookieApi.call('POST', '/auth/signup', { clubName: 'Cookie', email: 'c@example.com', password: '12345678', acceptTerms: true });
    const cookie = r.res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/bandeja_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(r.json.token).toBeNull();
    await cookieApi.close();
  });
});

describe('inscripciones sin registro', () => {
  let api: Api;
  let token: string;
  let t: { id: string; slug: string; categoryId: string };
  beforeAll(async () => {
    api = await setupApi();
    token = await signup(api, 'club2@example.com');
    t = await publishedTournament(api, token);
  });
  afterAll(() => api.close());

  it('un torneo en borrador no es público', async () => {
    const draft = await api.call('POST', '/admin/tournaments', tournamentBody({ name: 'Borrador' }), { token });
    const detail = await api.call('GET', `/admin/tournaments/${draft.json.id}`, undefined, { token });
    expect((await api.call('GET', `/public/tournaments/${detail.json.slug}`)).status).toBe(404);
    // El propio club sí puede previsualizarlo.
    const preview = await api.call('GET', `/public/tournaments/${detail.json.slug}`, undefined, { token });
    expect(preview.json.preview).toBe(true);
  });

  it('valida DNI, teléfono, email y consentimiento', async () => {
    const bad = await register(api, t.slug, t.categoryId, { ...fakePlayer(), dni: '12345678A', phone: '123', email: 'no-email' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.json.error.fields)).toEqual(expect.arrayContaining(['player1.dni', 'player1.phone', 'player1.email']));

    const noConsent = await register(api, t.slug, t.categoryId, fakePlayer(), fakePlayer(), { acceptPrivacy: false });
    expect(noConsent.status).toBe(400);
    expect(noConsent.json.error.fields.acceptPrivacy).toMatch(/privacidad/);

    const same = fakePlayer();
    expect((await register(api, t.slug, t.categoryId, same, { ...fakePlayer(), dni: same.dni })).status).toBe(400);
  });

  it('frena bots: campo trampa y envío demasiado rápido', async () => {
    expect((await register(api, t.slug, t.categoryId, fakePlayer(), fakePlayer(), { website: 'http://spam' })).status).toBe(400);
    expect((await register(api, t.slug, t.categoryId, fakePlayer(), fakePlayer(), { elapsedMs: 500 })).status).toBe(400);
  });

  it('confirma hasta el límite, después lista de espera, y evita DNIs duplicados', async () => {
    const first = fakePlayer('Carla');
    const r1 = await register(api, t.slug, t.categoryId, first);
    expect(r1.status).toBe(201);
    expect(r1.json.status).toBe('confirmed');
    expect(r1.json.manageUrl).toMatch(/^https:\/\/bandeja\.test\/inscripcion\/[A-Za-z0-9_-]{43}$/);

    const dup = await register(api, t.slug, t.categoryId, fakePlayer(), { ...fakePlayer(), dni: first.dni.toLowerCase() });
    expect(dup.status).toBe(409);
    expect(dup.json.error.fields['player2.dni']).toBeTruthy();

    for (let i = 0; i < 3; i++) expect((await register(api, t.slug, t.categoryId)).json.status).toBe('confirmed');
    const w = await register(api, t.slug, t.categoryId);
    expect(w.json).toMatchObject({ status: 'waitlist', waitlistPosition: 1 });
    expect(api.sent.at(-1)!.kind).toBe('registration_waitlist');
    expect(api.sent.at(-1)!.text).toContain(w.json.manageUrl);
  });

  it('las páginas públicas nunca muestran DNI, email ni teléfono', async () => {
    const regs = (await api.call('GET', `/admin/tournaments/${t.id}/registrations`, undefined, { token })).json as AdminRegistration[];
    const pub = await api.call('GET', `/public/tournaments/${t.slug}`);
    const text = JSON.stringify(pub.json);
    expect(regs.length).toBeGreaterThan(3);
    for (const r of regs) {
      for (const p of r.players) {
        if (r.status === 'confirmed') expect(text).toContain(p.fullName);
        expect(text).not.toContain(p.dni!);
        expect(text).not.toContain(p.email!);
        expect(text).not.toContain(p.phone!.replace(/\s/g, '').slice(3));
        expect(text).not.toContain(p.phone!);
      }
    }
  });

  it('la pareja gestiona su inscripción con el enlace privado y la lista de espera avanza sola', async () => {
    const r = await register(api, t.slug, t.categoryId); // otra más en espera (posición 2)
    expect(r.json.status).toBe('waitlist');
    const confirmed = await register(api, t.slug, t.categoryId);
    expect(confirmed.json.waitlistPosition).toBe(3);

    // Una pareja confirmada cancela -> la primera en espera pasa a confirmada.
    const regs = (await api.call('GET', `/admin/tournaments/${t.id}/registrations`, undefined, { token })).json as AdminRegistration[];
    const firstWaiting = regs.find((x) => x.waitlistPosition === 1)!;
    const tokenOf = (url: string) => url.split('/').pop()!;
    const mine = api.sent.find((e) => e.kind === 'registration_confirmed')!;
    const manageToken = tokenOf(/inscripcion\/([A-Za-z0-9_-]+)/.exec(mine.text)![0]);

    const view = await api.call('GET', `/public/registrations/${manageToken}`);
    expect(view.status).toBe(200);
    expect(view.json.players[0].dniMasked).toMatch(/^•+\d{3}[A-Z]$/);
    expect(view.json.canCancel).toBe(true);

    const upd = await api.call('PUT', `/public/registrations/${manageToken}`, {
      player1: { ...view.json.players[0], phone: '699 111 222', dni: '' },
      player2: { ...view.json.players[1], dni: '' },
    });
    expect(upd.status).toBe(200);
    expect((await api.call('GET', `/public/registrations/${manageToken}`)).json.players[0].phone).toBe('+34 699 111 222');

    expect((await api.call('POST', `/public/registrations/${manageToken}/cancel`, {})).status).toBe(200);
    const after = (await api.call('GET', `/admin/tournaments/${t.id}/registrations`, undefined, { token })).json as AdminRegistration[];
    expect(after.find((x) => x.id === firstWaiting.id)!.status).toBe('confirmed');
    expect(api.sent.some((e) => e.kind === 'waitlist_promoted')).toBe(true);
    expect(api.sent.some((e) => e.kind === 'registration_cancelled')).toBe(true);

    // El DNI de la pareja cancelada queda libre para volver a inscribirse.
    expect((await api.call('GET', `/public/registrations/${manageToken}`)).json.status).toBe('cancelled');
    expect((await api.call('GET', '/public/registrations/token-inventado-que-no-existe-123')).status).toBe(404);
  });

  it('limita el número de inscripciones por IP', async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) {
      const r = await api.call(
        'POST',
        `/public/tournaments/${t.slug}/registrations`,
        { categoryId: t.categoryId, player1: fakePlayer(), player2: fakePlayer(), acceptPrivacy: true, elapsedMs: 9000 },
        { ip: '66.66.66.66' },
      );
      last = r.status;
    }
    expect(last).toBe(429);
  });

  it('exporta CSV para Excel neutralizando fórmulas', async () => {
    await api.call(
      'POST',
      `/admin/tournaments/${t.id}/registrations`,
      { categoryId: t.categoryId, player1: { ...fakePlayer(), fullName: '=HYPERLINK("x") Malo' }, player2: fakePlayer(), consentConfirmed: true },
      { token },
    );
    const r = await api.call('GET', `/admin/tournaments/${t.id}/registrations.csv`, undefined, { token });
    expect(r.res.headers.get('content-type')).toMatch(/text\/csv/);
    const bytes = new Uint8Array(await r.res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 para Excel
    const csv = r.json as string;
    expect(csv).toContain('Jugador 1;DNI/NIE 1');
    expect(csv).toContain(`"'=HYPERLINK(""x"") Malo"`);
  });
});

describe('cuadros, resultados y control de acceso', () => {
  let api: Api;
  let token: string;
  let other: string;
  let t: { id: string; slug: string; categoryId: string };
  beforeAll(async () => {
    api = await setupApi();
    token = await signup(api, 'club3@example.com');
    other = await signup(api, 'rival@example.com');
    t = await publishedTournament(api, token, { maxPairs: 8, format: 'consolation' });
    for (let i = 0; i < 6; i++) await register(api, t.slug, t.categoryId);
  });
  afterAll(() => api.close());

  const competition = async () =>
    (await api.call('GET', `/admin/tournaments/${t.id}/competition`, undefined, { token })).json as AdminCompetitionView;

  it('otro club no puede ver ni tocar el torneo', async () => {
    expect((await api.call('GET', `/admin/tournaments/${t.id}`, undefined, { token: other })).status).toBe(404);
    expect((await api.call('GET', `/admin/tournaments/${t.id}/registrations`, undefined, { token: other })).status).toBe(404);
    expect((await api.call('POST', `/admin/categories/${t.categoryId}/draw`, {}, { token: other })).status).toBe(404);
    const regs = (await api.call('GET', `/admin/tournaments/${t.id}/registrations`, undefined, { token })).json as AdminRegistration[];
    expect((await api.call('PATCH', `/admin/registrations/${regs[0]!.id}`, { paid: true }, { token: other })).status).toBe(404);
    expect(((await api.call('GET', '/admin/tournaments', undefined, { token: other })).json as unknown[]).length).toBe(0);
  });

  it('marca pagado y cabezas de serie (sin repetir)', async () => {
    const regs = (await api.call('GET', `/admin/tournaments/${t.id}/registrations`, undefined, { token })).json as AdminRegistration[];
    expect((await api.call('PATCH', `/admin/registrations/${regs[0]!.id}`, { paid: true, seed: 1 }, { token })).status).toBe(200);
    expect((await api.call('PATCH', `/admin/registrations/${regs[1]!.id}`, { seed: 1 }, { token })).status).toBe(409);
    expect((await api.call('PATCH', `/admin/registrations/${regs[1]!.id}`, { seed: 2 }, { token })).status).toBe(200);
  });

  it('genera el cuadro con byes para las cabezas de serie y cierra inscripciones', async () => {
    const r = await api.call('POST', `/admin/categories/${t.categoryId}/draw`, { useSeeds: true }, { token });
    expect(r.status).toBe(201);
    const comp = await competition();
    const cat = comp.categories[0]!;
    expect(cat.drawGenerated).toBe(true);
    expect(cat.registrationOpen).toBe(false);
    const byes = cat.matches.filter((m) => m.status === 'bye');
    expect(byes).toHaveLength(2);
    const seeded = new Set(cat.pairs.filter((p) => p.seed).map((p) => p.id));
    for (const m of byes) {
      const holder = m.a.kind === 'pair' ? m.a.pairId : m.b.kind === 'pair' ? m.b.pairId : '';
      expect(seeded.has(holder)).toBe(true);
    }
    expect((await register(api, t.slug, t.categoryId)).status).toBe(409);
    // No se puede dar de baja a una pareja que ya está en el cuadro.
    const regs = (await api.call('GET', `/admin/tournaments/${t.id}/registrations`, undefined, { token })).json as AdminRegistration[];
    expect((await api.call('POST', `/admin/registrations/${regs[0]!.id}/cancel`, {}, { token })).status).toBe(409);
  });

  it('introduce resultados, valida el marcador y avanza el cuadro', async () => {
    let cat = (await competition()).categories[0]!;
    const ready = cat.matches.filter((m) => m.status === 'ready' && m.phase === 'main');
    expect(ready.length).toBe(2);
    const m = ready[0]!;

    const invalid = await api.call('PUT', `/admin/matches/${m.id}/result`, { outcome: 'normal', sets: [{ a: 6, b: 4 }, { a: 4, b: 6 }] }, { token });
    expect(invalid.status).toBe(400);
    expect(invalid.json.error.message).toMatch(/super tie-break/);

    const ok = await api.call('PUT', `/admin/matches/${m.id}/result`, { outcome: 'normal', sets: [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 10, b: 7 }] }, { token });
    expect(ok.status).toBe(200);
    cat = (await competition()).categories[0]!;
    const next = cat.matches.find((x) => x.phase === 'main' && x.round === 2 && [x.a, x.b].some((s) => s.kind === 'pair' && m.a.kind === 'pair' && s.pairId === m.a.pairId));
    expect(next).toBeTruthy();
    // El perdedor va a consolación.
    const loserId = m.b.kind === 'pair' ? m.b.pairId : '';
    expect(cat.matches.some((x) => x.phase === 'consolation' && [x.a, x.b].some((s) => s.kind === 'pair' && s.pairId === loserId))).toBe(true);

    // Resultados posteriores bloquean cambiar el ganador de este partido.
    if (next!.status === 'ready') {
      expect((await api.call('PUT', `/admin/matches/${next!.id}/result`, { outcome: 'walkover', sets: [], winner: 'a' }, { token })).status).toBe(200);
      const change = await api.call('PUT', `/admin/matches/${m.id}/result`, { outcome: 'normal', sets: [{ a: 4, b: 6 }, { a: 4, b: 6 }] }, { token });
      expect(change.status).toBe(409);
      // Corregir el marcador manteniendo el ganador sí se permite.
      const fix = await api.call('PUT', `/admin/matches/${m.id}/result`, { outcome: 'normal', sets: [{ a: 6, b: 4 }, { a: 6, b: 4 }] }, { token });
      expect(fix.status).toBe(200);
      expect((await api.call('DELETE', `/admin/matches/${m.id}/result`, undefined, { token })).status).toBe(409);
      expect((await api.call('DELETE', `/admin/matches/${next!.id}/result`, undefined, { token })).status).toBe(200);
    }

    // El público ve el marcador.
    const pub = (await api.call('GET', `/public/tournaments/${t.slug}`)).json as PublicTournamentView;
    expect(pub.categories[0]!.matches.find((x) => x.id === m.id)!.sets.length).toBeGreaterThan(0);
  });

  it('programa partidos y detecta solapes de pista y de pareja', async () => {
    const comp = await competition();
    const cat = comp.categories[0]!;
    const playable = cat.matches.filter((m) => m.status === 'ready' || m.status === 'waiting');
    const [m1, m2] = playable;
    const court = comp.courts[0]!.id;
    expect((await api.call('PUT', `/admin/matches/${m1!.id}/schedule`, { courtId: court, scheduledAt: '2030-05-10T10:00' }, { token })).status).toBe(200);
    expect((await api.call('PUT', `/admin/matches/${m2!.id}/schedule`, { courtId: court, scheduledAt: '2030-05-10T10:30' }, { token })).status).toBe(200);
    const after = await competition();
    expect(after.conflicts.some((c) => c.type === 'court' && c.matchId === m1!.id)).toBe(true);
    const scheduled = after.categories[0]!.matches.find((m) => m.id === m1!.id)!;
    expect(scheduled.scheduledAt).toBe('2030-05-10T08:00:00.000Z'); // 10:00 en Madrid (horario de verano)

    const auto = await api.call(
      'POST',
      `/admin/tournaments/${t.id}/schedule/auto`,
      { days: [{ date: '2030-05-10', from: '09:00', to: '22:00' }, { date: '2030-05-11', from: '09:00', to: '14:00' }], slotMin: 30, restMin: 30, replaceExisting: true },
      { token },
    );
    expect(auto.status).toBe(200);
    expect(auto.json.unscheduled).toBe(0);
    const final = await competition();
    expect(final.conflicts.filter((c) => c.type !== 'order')).toEqual([]);
  });

  it('permite ajustar el sorteo a mano solo sin resultados', async () => {
    const cat = (await competition()).categories[0]!;
    const r1 = cat.matches.filter((m) => m.phase === 'main' && m.round === 1);
    const swap = await api.call(
      'POST',
      `/admin/categories/${t.categoryId}/draw/swap`,
      { kind: 'slots', x: { match: r1[0]!.key, side: 'b' }, y: { match: r1[1]!.key, side: 'b' } },
      { token },
    );
    expect(swap.status).toBe(409);
  });
});

describe('datos de demostración', () => {
  it('se crean una sola vez y dejan todo funcionando', async () => {
    const api = await setupApi();
    expect(await seedIfEmpty(api.deps)).toBe(true);
    expect(await seedIfEmpty(api.deps)).toBe(false);
    const login = await api.call('POST', '/auth/login', { email: DEMO_CLUB.email, password: DEMO_CLUB.password });
    expect(login.status).toBe(200);
    const list = (await api.call('GET', '/admin/tournaments', undefined, { token: login.json.token })).json as Array<{ status: string }>;
    expect(list.map((x) => x.status).sort()).toEqual(['draft', 'finished', 'published', 'published']);
    const pub = (await api.call('GET', '/public/tournaments')).json as Array<{ slug: string; name: string }>;
    expect(pub).toHaveLength(3);
    const finished = (await api.call('GET', `/public/tournaments/${pub.find((x) => x.name === 'Torneo Express')!.slug}`)).json as PublicTournamentView;
    for (const cat of finished.categories) expect(cat.podium.champion).toBeTruthy();
    await api.close();
  });
});
