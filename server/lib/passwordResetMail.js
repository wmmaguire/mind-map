import nodemailer from 'nodemailer';

/** Nodemailer expects e.g. `smtps://user:pass@smtp.gmail.com:465`, not an https app URL. */
function isSmtpConnectionUrl(url) {
  const lower = url.toLowerCase();
  return lower.startsWith('smtp://') || lower.startsWith('smtps://');
}

function getTransport() {
  const url = (process.env.SMTP_URL || '').trim();
  if (url && !isSmtpConnectionUrl(url)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[password reset] SMTP_URL must start with smtp:// or smtps:// (web app URLs are ignored). Using SMTP_HOST / SMTP_USER / SMTP_PASS.'
      );
    }
  } else if (url && isSmtpConnectionUrl(url)) {
    return nodemailer.createTransport(url);
  }
  const host = (process.env.SMTP_HOST || '').trim();
  if (!host) return null;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = process.env.SMTP_PASS || '';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
}

/** True when outbound email is configured (production resets require this). */
export function hasMailTransport() {
  return getTransport() != null;
}

const fromDefault = () =>
  (process.env.MAIL_FROM || process.env.SMTP_FROM || 'noreply@localhost').trim();

/**
 * @param {{ to: string, resetUrl: string }} opts
 * @returns {Promise<{ sent: boolean, devLog?: string }>}
 */
export async function sendPasswordResetEmail({ to, resetUrl }) {
  const transport = getTransport();
  const text =
    `You requested a password reset for your MindMap account.\n\n`
    + `Open this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\n`
    + `If you did not request this, you can ignore this email.\n`;

  if (!transport) {
    const devLog =
      process.env.NODE_ENV !== 'production'
        ? `[password reset] SMTP not configured — reset link for ${to}:\n${resetUrl}`
        : null;
    if (devLog) {
      console.info(devLog);
    } else {
      console.error(
        '[password reset] SMTP not configured (set SMTP_URL or SMTP_HOST); email not sent'
      );
    }
    return { sent: false, devLog: devLog || undefined };
  }

  await transport.sendMail({
    from: fromDefault(),
    to,
    subject: 'Reset your MindMap password',
    text,
  });
  return { sent: true };
}
