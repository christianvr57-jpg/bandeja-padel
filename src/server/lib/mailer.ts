import type { DB } from '../db';
import { emails } from '../db/schema';

export interface OutgoingEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
  kind: string;
  tournamentId?: string | null;
}

export type MailTransport = (msg: { to: string; subject: string; text: string; html: string }) => Promise<void>;

export interface Mailer {
  /** Nunca lanza: un fallo de email no debe tumbar una inscripción. */
  send(db: DB, email: OutgoingEmail): Promise<void>;
}

/**
 * Envía con el transporte configurado (SMTP) y deja constancia en la tabla
 * `emails`. Sin transporte, el email solo se registra (estado "logged"). El
 * cuerpo (que contiene enlaces privados) solo se guarda si `storeBodies`.
 */
export function createMailer(opts: { transport?: MailTransport; storeBodies: boolean }): Mailer {
  return {
    async send(db, email) {
      const recipients = [...new Set(email.to.map((t) => t.trim().toLowerCase()).filter(Boolean))];
      for (const to of recipients) {
        let status = 'logged';
        let error: string | null = null;
        if (opts.transport) {
          try {
            await opts.transport({ to, subject: email.subject, text: email.text, html: email.html });
            status = 'sent';
          } catch (err) {
            status = 'failed';
            error = err instanceof Error ? err.message.slice(0, 500) : String(err);
            console.error(`[email] Error enviando a ${to}:`, error);
          }
        }
        try {
          await db.insert(emails).values({
            tournamentId: email.tournamentId ?? null,
            toEmail: to,
            subject: email.subject,
            kind: email.kind,
            body: opts.storeBodies ? email.text : null,
            status,
            error,
          });
        } catch (err) {
          console.error('[email] No se pudo registrar el email:', err);
        }
      }
    },
  };
}
