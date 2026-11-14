/**
 * Gửi email qua SMTP (nodemailer). Cấu hình bằng biến môi trường:
 *   SMTP_USER, SMTP_PASS  tài khoản gửi (với Gmail: mật khẩu ứng dụng)
 *   SMTP_HOST (mặc định smtp.gmail.com), SMTP_PORT (mặc định 465), MAIL_FROM (mặc định "Tên app <SMTP_USER>")
 *   MAIL_MODE=log         chỉ in email ra log của server (dùng khi phát triển, không gửi thật)
 */
import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function mailConfigured(): boolean {
  return process.env.MAIL_MODE === 'log' || (!!process.env.SMTP_USER && !!process.env.SMTP_PASS);
}

export async function sendMail(mail: Mail): Promise<void> {
  if (process.env.MAIL_MODE === 'log') {
    console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return;
  }
  const port = Number(process.env.SMTP_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10_000,
  });
  const from = process.env.MAIL_FROM || `"Task management" <${process.env.SMTP_USER}>`;
  await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Email đặt lại mật khẩu (tiếng Việt hoặc tiếng Anh theo ngôn ngữ người dùng đang dùng) */
export function resetEmail(to: string, name: string, link: string, lang: 'vi' | 'en'): Mail {
  const vi = lang === 'vi';
  const hello = vi ? `Xin chào ${name || to},` : `Hello ${name || to},`;
  const line1 = vi
    ? 'Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản này. Bấm vào nút bên dưới để chọn mật khẩu mới. Liên kết có hiệu lực trong 1 giờ và chỉ dùng được một lần.'
    : 'You (or someone else) asked to reset the password for this account. Use the button below to choose a new password. The link is valid for 1 hour and works only once.';
  const cta = vi ? 'Đặt lại mật khẩu' : 'Reset password';
  const ignore = vi
    ? 'Nếu không phải bạn yêu cầu, hãy bỏ qua email này: mật khẩu của bạn vẫn giữ nguyên.'
    : "If you didn't ask for this, ignore this email: your password stays the same.";
  const subject = vi ? 'Đặt lại mật khẩu' : 'Reset your password';
  const text = `${hello}\n\n${line1}\n\n${link}\n\n${ignore}\n`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e5e7eb">
<tr><td style="padding:28px 28px 8px"><div style="font-size:18px;font-weight:700">Task management</div></td></tr>
<tr><td style="padding:8px 28px;font-size:15px;line-height:1.6">${esc(hello)}<br><br>${esc(line1)}</td></tr>
<tr><td style="padding:12px 28px 20px"><a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px">${esc(cta)}</a></td></tr>
<tr><td style="padding:0 28px 8px;font-size:12.5px;color:#6b7280;line-height:1.6;word-break:break-all">${esc(link)}</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:13px;color:#6b7280;line-height:1.6">${esc(ignore)}</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}
