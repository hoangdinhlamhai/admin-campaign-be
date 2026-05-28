export type TargetReachedTemplateArgs = {
  campaignName: string
  campaignCode: string
  campaignId: string
  completed: number
  target: number
  feUrl: string
  assigneeName: string | null
  autoReactivateEnabled: boolean
}

export type RenderedEmail = {
  subject: string
  html: string
}

export function renderTargetReachedEmail(args: TargetReachedTemplateArgs): RenderedEmail {
  const subject = `[Senlyzer] Campaign "${args.campaignName}" đã đạt target — Tạm dừng QC ngay`
  const detailUrl = `${args.feUrl.replace(/\/$/, '')}/campaigns/${args.campaignId}`
  const greeting = args.assigneeName ? `Chào ${args.assigneeName}` : 'Chào bạn'
  const reactivateNote = args.autoReactivateEnabled
    ? 'Campaign sẽ <strong>tự động reactivate vào 00:00 ngày mai</strong>.'
    : 'Campaign sẽ giữ trạng thái "Tạm dừng" cho đến khi bạn bật lại tay.'

  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;max-width:600px">
<tr><td style="padding:24px 28px;background:#10b981;color:#fff">
<h1 style="margin:0;font-size:18px;font-weight:700">✓ Senlyzer — Campaign đã đạt target</h1>
</td></tr>
<tr><td style="padding:24px 28px">
<p style="margin:0 0 12px;font-size:15px">${escapeHtml(greeting)},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5">
Campaign <strong>${escapeHtml(args.campaignCode)} — ${escapeHtml(args.campaignName)}</strong> đã đạt target hôm nay:
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:16px">
<tr><td style="padding:14px 18px;font-size:14px">
<div style="color:#065f46"><strong>Đã hoàn thành:</strong> ${args.completed} / ${args.target} user</div>
<div style="color:#065f46;margin-top:6px"><strong>⏸ Senlyzer đã tự động tạm dừng campaign này.</strong></div>
</td></tr>
</table>
<h2 style="margin:20px 0 10px;font-size:16px;color:#dc2626">⚠️ Hành động cần làm NGAY (tiết kiệm chi phí QC):</h2>
<ol style="margin:0 0 16px;padding-left:22px;font-size:14px;line-height:1.7">
<li><strong>Google Ads</strong> (nếu có): vào <code style="background:#f3f4f6;padding:2px 5px;border-radius:3px">ads.google.com</code> → chọn campaign → Status → <strong>Pause</strong></li>
<li><strong>TikTok Ads</strong> (nếu có): vào <code style="background:#f3f4f6;padding:2px 5px;border-radius:3px">ads.tiktok.com</code> → Campaigns → toggle <strong>Off</strong></li>
<li><strong>Kiểm tra Senlyzer</strong>: <a href="${escapeHtml(detailUrl)}" style="color:#10b981;font-weight:600">Mở campaign detail</a></li>
</ol>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280;line-height:1.5">
${reactivateNote}<br>
Nếu bạn muốn <strong>tiếp tục chạy hôm nay (vượt target)</strong>: vào Senlyzer admin → bấm "Xuất bản" để bật lại.
</p>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td style="background:#10b981;border-radius:8px">
<a href="${escapeHtml(detailUrl)}" style="display:inline-block;padding:12px 24px;color:#fff;text-decoration:none;font-weight:600;font-size:14px">Mở campaign trên Senlyzer</a>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:18px 28px;background:#f9fafb;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb">
Email tự động từ Senlyzer Admin · Không reply vào email này.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  return { subject, html }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
