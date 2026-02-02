export function withdrawalTemplate(
  amount: string,
  currency: string,
  details?: any
) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Withdrawal Completed</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px;background:#f6f8fb;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;">
    <h2 style="color:#2563eb;margin:0 0 8px;">Withdrawal Successful</h2>
    <p style="margin:0 0 12px;">Your withdrawal of <strong>${amount} ${currency}</strong> has been completed.</p>
    ${
      details
        ? `<pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:6px">${JSON.stringify(
            details,
            null,
            2
          )}</pre>`
        : ""
    }
    <p style="font-size:12px;color:#777;margin-top:18px;">If you did not authorize this, contact support immediately.</p>
  </div>
</body>
</html>`;
}
