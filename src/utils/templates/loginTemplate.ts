export function loginTemplate(nameOrEmail: string, details?: any) {
  const primary = "#1e40af"; // dark blue
  const bg = "#ffffff";
  const text = "#0f172a";
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Login Notification</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:${text};margin:0;padding:24px;background:#f6f8fb;">
  <div style="max-width:600px;margin:0 auto;background:${bg};padding:24px;border-radius:8px;">
    <h2 style="color:${primary};margin:0 0 8px;">New sign-in to your Velo account</h2>
    <p style="margin:0 0 12px;">Hello ${nameOrEmail}, we detected a new sign-in to your Velo account.</p>
    ${
      details
        ? `<pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:6px">${JSON.stringify(
            details,
            null,
            2
          )}</pre>`
        : '<p style="margin:0 0 12px;color:#374151;">If this was you, no further action is required. If you don\'t recognize this activity, please secure your account immediately.</p>'
    }
    <p style="font-size:12px;color:#6b7280;margin-top:18px;">Velo • Secure crypto payments</p>
  </div>
</body>
</html>`;
}
