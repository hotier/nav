import { Resend } from "resend";

const DEFAULT_FROM = "OneNav <noreply@nav.hotier.cc.cd>";
const DEFAULT_SITE_NAME = "OneNav";

/** 邮件服务是否已配置（RESEND_API_KEY 存在） */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** 站点显示名：优先取 RESEND_FROM 中的显示名（如 `OneNav <...>` 中的 OneNav） */
function getSiteName(): string {
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const match = from.match(/^\s*"?([^"<]+)"?\s*</);
  return match?.[1]?.trim() || DEFAULT_SITE_NAME;
}

/** 站点地址：调用方传入的 origin 优先，其次环境变量兜底 */
function getSiteUrl(fallback?: string): string {
  return fallback || process.env.NEXTAUTH_URL || process.env.AUTH_URL || "";
}

/**
 * 邮件发送错误：携带 Resend 返回的 HTTP 状态码，便于调用方区分处理
 * （如 429 表示配额/频率受限）
 */
export class EmailSendError extends Error {
  statusCode?: number | null;

  constructor(message: string, statusCode?: number | null) {
    super(message);
    this.name = "EmailSendError";
    this.statusCode = statusCode;
  }
}

/**
 * 发送验证码邮件的通用实现
 * @throws 未配置邮件服务或 Resend 发送失败时抛出 EmailSendError
 */
async function sendCodeEmail(opts: {
  to: string;
  code: string;
  subject: string;
  title: string;
  intro: string;
  note: string;
  /** 收件人称呼（用户名），缺省时使用站点名 */
  username?: string | null;
  /** 站点首页地址，用于生成操作链接与页脚站点链接 */
  siteUrl?: string;
  /** 操作落地页相对路径，如 /reset-pwd、/login */
  actionPath?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // 邮件未配置：拒绝发送（注册/自助重置密码流程随之关闭，仅保留管理员后台重置密码）
    throw new EmailSendError("邮件服务未配置");
  }
  const from = process.env.RESEND_FROM || DEFAULT_FROM;
  const site = getSiteName();
  const siteUrl = getSiteUrl(opts.siteUrl);
  const base = siteUrl.replace(/\/+$/, "");
  const actionUrl = base && opts.actionPath ? `${base}${opts.actionPath}` : "";

  const greeting = opts.username
    ? `尊敬的 ${opts.username} 用户，您好：`
    : `尊敬的 ${site} 用户，您好：`;

  const actionButton = actionUrl
    ? `<div style="margin:0 0 24px;text-align:center;">
        <a href="${actionUrl}" style="display:inline-block;padding:12px 28px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">前往 ${site} 验证</a>
      </div>`
    : "";

  const footerAutoText = siteUrl
    ? `此邮件由 <a href="${siteUrl}" style="color:#9ca3af;text-decoration:underline;">${site}</a> 系统自动发送，请勿直接回复。`
    : `此邮件由 ${site} 系统自动发送，请勿直接回复。`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: opts.subject,
    html: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#f4f6f8;" bgcolor="#f4f6f8">
        <tr>
          <td align="center" style="padding:32px 16px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
              <!-- 品牌区 -->
              <tr>
                <td align="center" style="padding-bottom:20px;">
                  <div style="font-size:20px;font-weight:700;color:#111827;letter-spacing:0.5px;">${site}</div>
                </td>
              </tr>
              <!-- 主卡片 -->
              <tr>
                <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px 32px 28px;" bgcolor="#ffffff">
                  <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#111827;">${opts.title}</h1>
                  <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">${greeting}</p>
                  <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#374151;">${opts.intro}</p>
                  <div style="margin:0 0 24px;padding:20px 16px;background:#f3f4f6;border-radius:8px;text-align:center;">
                    <div style="font-size:34px;font-weight:700;letter-spacing:12px;color:#111827;font-variant-numeric:tabular-nums;">${opts.code}</div>
                  </div>
                  ${actionButton}
                  <p style="margin:0 0 16px;font-size:13px;line-height:1.8;color:#6b7280;">${opts.note}</p>
                </td>
              </tr>
              <!-- 页脚 -->
              <tr>
                <td align="center" style="padding:20px 16px 0;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">${footerAutoText}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `,
  });
  if (error) {
    throw new EmailSendError(error.message, error.statusCode);
  }
}

/** 发送密码重置验证码邮件 */
export function sendResetCode(opts: {
  to: string;
  code: string;
  username?: string | null;
  siteUrl?: string;
}): Promise<void> {
  const site = getSiteName();
  return sendCodeEmail({
    to: opts.to,
    code: opts.code,
    subject: `【${site}】密码重置验证码`,
    title: "密码重置",
    username: opts.username,
    siteUrl: opts.siteUrl,
    actionPath: "/reset-pwd",
    intro: opts.username
      ? `您正在申请重置 ${site} 账号（${opts.username}）的登录密码。为保障账号安全，请将下方验证码输入至重置页面，完成身份验证后即可设置新密码。`
      : `您正在申请重置 ${site} 账号的登录密码。为保障账号安全，请将下方验证码输入至重置页面，完成身份验证后即可设置新密码。`,
    note: "验证码 5 分钟内有效，请勿告知他人（包括任何自称平台工作人员的人）。如非您本人操作，请忽略本邮件，您的密码将保持不变。",
  });
}

/** 发送注册邮箱验证码邮件 */
export function sendRegisterCode(opts: {
  to: string;
  code: string;
  siteUrl?: string;
}): Promise<void> {
  const site = getSiteName();
  return sendCodeEmail({
    to: opts.to,
    code: opts.code,
    subject: `【${site}】注册邮箱验证`,
    title: "注册邮箱验证",
    siteUrl: opts.siteUrl,
    actionPath: "/login",
    intro: `您正在使用此邮箱注册 ${site} 账号。为确认邮箱归属，请将下方验证码输入至注册页面，完成验证后即可继续注册流程。`,
    note: "验证码 5 分钟内有效，请勿告知他人（包括任何自称平台工作人员的人）。如非您本人操作，请忽略本邮件。",
  });
}
