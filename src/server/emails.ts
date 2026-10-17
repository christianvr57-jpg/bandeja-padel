import { formatPrice } from '../shared/labels';
import { formatDayRange } from '../shared/time';
import type { OutgoingEmail } from './lib/mailer';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Ctx {
  to: string[];
  tournamentId: string;
  tournamentName: string;
  clubName: string;
  startDate: string;
  endDate: string;
  categoryLabel: string;
  players: string[];
  manageUrl: string | null;
  publicUrl: string;
  priceCents: number;
}

function layout(title: string, paragraphs: string[], cta?: { label: string; url: string }, footer?: string): string {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#0b3b5c;color:#d9f99d;padding:18px 24px;font-weight:bold;font-size:18px">Bandeja · Torneos de pádel</td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 12px;line-height:1.5">${p}</p>`).join('\n')}
${cta ? `<p style="margin:20px 0"><a href="${esc(cta.url)}" style="background:#0b3b5c;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;display:inline-block;font-weight:bold">${esc(cta.label)}</a></p>` : ''}
${footer ? `<p style="margin:16px 0 0;font-size:12px;color:#64748b;line-height:1.5">${footer}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
}

function details(ctx: Ctx): { html: string; text: string } {
  const rows: Array<[string, string]> = [
    ['Torneo', ctx.tournamentName],
    ['Organiza', ctx.clubName],
    ['Fechas', formatDayRange(ctx.startDate, ctx.endDate)],
    ['Categoría', ctx.categoryLabel],
    ['Pareja', ctx.players.join(' / ')],
    ['Inscripción', formatPrice(ctx.priceCents) + (ctx.priceCents ? ' por pareja (paga en el club)' : '')],
  ];
  return {
    html: rows.map(([k, v]) => `<strong>${esc(k)}:</strong> ${esc(v)}`).join('<br>'),
    text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
  };
}

const PRIVATE_NOTE =
  'Este enlace es personal: permite consultar, modificar o cancelar la inscripción sin contraseña. No lo compartas.';

export function registrationEmail(ctx: Ctx, status: 'confirmed' | 'waitlist', waitlistPosition: number | null): OutgoingEmail {
  const d = details(ctx);
  const title = status === 'confirmed' ? 'Inscripción confirmada' : 'Estás en la lista de espera';
  const intro =
    status === 'confirmed'
      ? 'Vuestra inscripción se ha registrado correctamente.'
      : `La categoría está completa, así que estáis en la lista de espera (posición ${waitlistPosition}). Si se libera una plaza os avisaremos por email automáticamente.`;
  const text = [
    title,
    '',
    intro,
    '',
    d.text,
    '',
    ctx.manageUrl ? `Gestionar la inscripción: ${ctx.manageUrl}` : '',
    `Página del torneo: ${ctx.publicUrl}`,
    '',
    PRIVATE_NOTE,
  ].join('\n');
  return {
    to: ctx.to,
    kind: `registration_${status}`,
    tournamentId: ctx.tournamentId,
    subject: `${title} · ${ctx.tournamentName}`,
    text,
    html: layout(
      title,
      [esc(intro), d.html, `Cuadros, horarios y resultados: <a href="${esc(ctx.publicUrl)}">${esc(ctx.publicUrl)}</a>`],
      ctx.manageUrl ? { label: 'Ver o modificar mi inscripción', url: ctx.manageUrl } : undefined,
      PRIVATE_NOTE,
    ),
  };
}

export function promotedEmail(ctx: Ctx): OutgoingEmail {
  const d = details(ctx);
  const intro = '¡Buenas noticias! Se ha liberado una plaza y vuestra pareja pasa de la lista de espera a inscrita.';
  return {
    to: ctx.to,
    kind: 'waitlist_promoted',
    tournamentId: ctx.tournamentId,
    subject: `¡Tenéis plaza! · ${ctx.tournamentName}`,
    text: ['¡Tenéis plaza!', '', intro, '', d.text, '', ctx.manageUrl ? `Gestionar: ${ctx.manageUrl}` : ''].join('\n'),
    html: layout('¡Tenéis plaza!', [esc(intro), d.html], ctx.manageUrl ? { label: 'Ver mi inscripción', url: ctx.manageUrl } : undefined, PRIVATE_NOTE),
  };
}

export function cancelledEmail(ctx: Ctx, byClub: boolean): OutgoingEmail {
  const d = details(ctx);
  const intro = byClub
    ? 'El club organizador ha dado de baja vuestra inscripción. Si crees que es un error, contacta con el club.'
    : 'Vuestra inscripción se ha cancelado correctamente.';
  return {
    to: ctx.to,
    kind: 'registration_cancelled',
    tournamentId: ctx.tournamentId,
    subject: `Inscripción cancelada · ${ctx.tournamentName}`,
    text: ['Inscripción cancelada', '', intro, '', d.text].join('\n'),
    html: layout('Inscripción cancelada', [esc(intro), d.html]),
  };
}

export type EmailContext = Ctx;
