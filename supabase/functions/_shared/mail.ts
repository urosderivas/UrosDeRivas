// Envío de emails desde un buzón del club (Arsys) por SMTP con SSL (puerto 465:
// Supabase no deja salir por el 25 ni el 587). Se configura con secretos de las
// funciones, que pone el club desde el panel de Supabase:
//   SMTP_USER  buzón completo: administracion@urosderivas.com
//   SMTP_PASS  su contraseña
//   SMTP_HOST  opcional (por defecto smtp.serviciodecorreo.es, el de Arsys)
//   SMTP_PORT  opcional (por defecto 465)
//   MAIL_REPLY_TO  opcional: a dónde van las respuestas si no es el mismo buzón
// Sin SMTP_USER o SMTP_PASS no se envía nada: la web enseña los mismos datos.
import nodemailer from "npm:nodemailer@6.9.16";
import { EMAIL_LOGO_PNG_BASE64 } from "./email-logo.ts";

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
      // El escudo va dentro del email (cid) para que se vea aunque se bloqueen las imágenes externas
      attachments: [{ filename: 'uros-de-rivas.png', content: EMAIL_LOGO_PNG_BASE64, encoding: 'base64', cid: LOGO_CID }],
    });
    return true;
  } catch (err) {
    console.error('No se pudo enviar el email:', err);
    return false;
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LOGO_CID = 'logo@urosderivas';
const CLUB_NAME = 'Club Deportivo Elemental Uros de Rivas';
const CLUB_ADDRESS = 'Calle de Aigües Tortes, 28522 Rivas-Vaciamadrid (Madrid)';
const CONTACT_EMAIL = 'administracion@urosderivas.com';
const SITE_URL = Deno.env.get('SITE_URL') || 'https://urosderivas.github.io/UrosDeRivas/';

/**
 * Plantilla común de los emails: cabecera negra con el escudo, tarjeta blanca y pie con
 * los datos del club. Tablas y estilos en línea, que es lo que entienden todos los correos.
 * Las plantillas de Supabase (supabase/templates) copian este mismo diseño.
 */
function emailLayout(opts: { preheader: string; title: string; body: string }): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${escapeHtml(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#f2f2ef">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2ef">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<tr><td align="center" style="background:#0d0d0d;padding:28px 24px 22px;border-bottom:4px solid #d4af37">
<img src="cid:${LOGO_CID}" width="75" height="96" alt="Uros de Rivas" style="display:block;border:0">
<div style="margin-top:12px;color:#d4af37;font-size:13px;font-weight:bold;letter-spacing:4px">UROS DE RIVAS</div>
</td></tr>
<tr><td style="padding:32px 28px 8px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#0d0d0d">${escapeHtml(opts.title)}</h1>
${opts.body}
</td></tr>
<tr><td style="padding:24px 28px 28px;border-top:1px solid #ececec;font-size:12px;line-height:1.6;color:#777777">
${CLUB_NAME}<br>${CLUB_ADDRESS}<br>
<a href="mailto:${CONTACT_EMAIL}" style="color:#9a7b1c">${CONTACT_EMAIL}</a> · <a href="${SITE_URL}" style="color:#9a7b1c">Web del club</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const p = (html: string, style = '') =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;${style}">${html}</p>`;

export interface TransferDetails {
  /** Qué se ha comprado o reservado, una línea por cosa */
  items: string[];
  amount: number;
  reference: string;
  iban: string;
  holder: string;
  note: string;
  /** Días para hacer la transferencia */
  deadlineDays: number;
  /** Nombre del comprador para saludarle, si lo ha puesto en "Mi cuenta" */
  name?: string;
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
  const hello = d.name?.trim() ? `Hola, ${d.name.trim()}:` : 'Hola:';
  const text = [
    hello,
    '',
    'Gracias por tu reserva en Uros de Rivas. Para completarla, haz una transferencia con estos datos:',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    `Tienes ${d.deadlineDays} días para hacer la transferencia. Pon el concepto tal cual: así el club sabe a qué corresponde tu pago.`,
    ...(d.note ? ['', d.note] : []),
    '',
    'Lo que has reservado:',
    ...d.items.map(i => `- ${i}`),
    '',
    'Tu reserva queda pendiente hasta que el club reciba la transferencia.',
    '',
    'Club Uros de Rivas',
  ].join('\n');

  const row = (label: string, value: string, valueStyle = '') =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e8e2cf;font-size:13px;color:#6b6b6b;width:90px;vertical-align:top">${label}</td>` +
    `<td style="padding:10px 0;border-bottom:1px solid #e8e2cf;font-size:15px;font-weight:bold;color:#0d0d0d;overflow-wrap:break-word;${valueStyle}">${value}</td></tr>`;
  const body = [
    p(escapeHtml(hello)),
    p('Gracias por tu reserva en <b>Uros de Rivas</b>. Para completarla, haz una transferencia con estos datos:'),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7ee;border:1px solid #e8e2cf;border-radius:10px;margin:0 0 20px">
<tr><td style="padding:6px 20px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Importe', escapeHtml(formatEuros(d.amount)), 'font-size:22px')}
${row('IBAN', escapeHtml(d.iban), 'font-family:Consolas,Menlo,monospace;letter-spacing:1px')}
${row('Titular', escapeHtml(d.holder))}
${row('Concepto', `<span style="display:inline-block;background:#0d0d0d;color:#d4af37;padding:4px 10px;border-radius:6px;font-family:Consolas,Menlo,monospace;letter-spacing:1px">${escapeHtml(d.reference)}</span>`)}
</table></td></tr></table>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
<td style="border-left:4px solid #d4af37;background:#fffbea;padding:12px 16px;font-size:14px;line-height:1.5;color:#3d3420">
Tienes <b>${d.deadlineDays} días</b> para hacer la transferencia. Pon el concepto <b>tal cual</b>: así el club sabe a qué corresponde tu pago.
</td></tr></table>`,
    d.note ? p(escapeHtml(d.note), 'color:#444444') : '',
    p('<b>Lo que has reservado</b>', 'margin-bottom:6px'),
    `<ul style="margin:0 0 20px;padding-left:20px;font-size:15px;line-height:1.6">${d.items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`,
    p('Tu reserva queda pendiente hasta que el club reciba la transferencia. Si tienes cualquier duda, responde a este email.', 'color:#444444'),
  ].join('\n');
  const html = emailLayout({
    preheader: `Importe ${formatEuros(d.amount)} · concepto ${d.reference}`,
    title: 'Datos para tu transferencia',
    body,
  });

  return { to, subject: `Uros de Rivas: datos para la transferencia (${d.reference})`, text, html };
}
