export function registrationTemplate(name: string, details?: any) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Welcome to Velo</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px;background:#f6f8fb;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;">
    <h1 style="color:#2563eb;margin:0 0 8px;">Welcome, ${name}!</h1>
    <p style="margin:0 0 16px;">Thanks for creating your Velo account. You're all set — explore your wallet and start transacting.</p>
    ${
      details
        ? `<pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:6px">${JSON.stringify(
            details,
            null,
            2
          )}</pre>`
        : ""
    }
    <p style="font-size:12px;color:#777;margin-top:18px;">If you didn't sign up, please contact support immediately.</p>
  </div>
</body>
</html>`;
}
