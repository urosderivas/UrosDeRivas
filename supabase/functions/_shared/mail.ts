// Envío de emails desde un buzón del club (Arsys) por SMTP con SSL (puerto 465:
// Supabase no deja salir por el 25 ni el 587). Se configura con secretos de las
// funciones, que pone el club desde el panel de Supabase:
//   SMTP_USER  buzón completo, p. ej. no-reply@urosderivas.com
//   SMTP_PASS  su contraseña
//   SMTP_HOST  opcional (por defecto smtp.serviciodecorreo.es, el de Arsys)
//   SMTP_PORT  opcional (por defecto 465)
//   MAIL_REPLY_TO  opcional: a dónde van las respuestas (p. ej. administracion@urosderivas.com)
// Sin SMTP_USER o SMTP_PASS no se envía nada: la web enseña los mismos datos.
import nodemailer from "npm:nodemailer@6.9.16";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const SEND_TIMEOUT_MS = 10_000;

export function mailConfigured(): boolean {
  return !!Deno.env.get('SMTP_USER') && !!Deno.env.get('SMTP_PASS');
}

/** Envía el email; devuelve false (sin lanzar) si no está configurado o falla. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const user = Deno.env.get('SMTP_USER');
  const pass = Deno.env.get('SMTP_PASS');
  if (!user || !pass || !mail.to) return false;
  const port = Number(Deno.env.get('SMTP_PORT') || 465);
  try {
    const transport = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST') || 'smtp.serviciodecorreo.es',
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
    await transport.sendMail({
      from: { name: 'Uros de Rivas', address: user },
      replyTo: Deno.env.get('MAIL_REPLY_TO') || undefined,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (err) {
    console.error('No se pudo enviar el email:', err);
    return false;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface TransferDetails {
  /** Qué se ha comprado o reservado, una línea por cosa */
  items: string[];
  amount: number;
  reference: string;
  iban: string;
  holder: string;
  note: string;
}

export const formatEuros = (v: number) =>
  `${v.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} €`;

/** Email con los datos para hacer la transferencia. */
export function transferMail(to: string, d: TransferDetails): Mail {
  const rows: [string, string][] = [
    ['Importe', formatEuros(d.amount)],
    ['IBAN', d.iban],
    ['Titular', d.holder],
    ['Concepto', d.reference],
  ];
  const text = [
    'Hola:',
    '',
    'Gracias por tu reserva en Uros de Rivas. Para completarla, haz una transferencia con estos datos:',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    'Pon el concepto tal cual: así el club sabe a qué corresponde tu pago.',
    ...(d.note ? ['', d.note] : []),
    '',
    'Lo que has reservado:',
    ...d.items.map(i => `- ${i}`),
    '',
    'Tu reserva queda pendiente hasta que el club reciba la transferencia.',
    '',
    'Club Uros de Rivas',
  ].join('\n');

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;max-width:560px">
<p>Hola:</p>
<p>Gracias por tu reserva en <b>Uros de Rivas</b>. Para completarla, haz una transferencia con estos datos:</p>
<table style="border-collapse:collapse;margin:12px 0">
${rows.map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#555">${k}</td><td style="padding:6px 0;font-weight:bold">${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p>Pon el concepto tal cual: así el club sabe a qué corresponde tu pago.</p>
${d.note ? `<p>${escapeHtml(d.note)}</p>` : ''}
<p style="margin-bottom:4px">Lo que has reservado:</p>
<ul style="margin-top:0">${d.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
<p>Tu reserva queda pendiente hasta que el club reciba la transferencia.</p>
<p>Club Uros de Rivas</p>
</div>`;

  return { to, subject: `Uros de Rivas: datos para la transferencia (${d.reference})`, text, html };
}
