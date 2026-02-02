export function qrPaymentTemplate(
  title: string,
  amount: string,
  currency: string,
  details?: any
) {
  const primary = "#1e40af";
  const text = "#0f172a";
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:${text};margin:0;padding:24px;background:#f6f8fb;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;">
    <h2 style="color:${primary};margin:0 0 8px;">${title}</h2>
    <p style="margin:0 0 12px;">Amount: <strong>${amount} ${currency}</strong></p>
    ${
      details
        ? `<pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:6px">${JSON.stringify(
            details,
            null,
            2
          )}</pre>`
        : ""
    }
    <p style="font-size:12px;color:#6b7280;margin-top:18px;">Thank you for using Velo QR payments.</p>
  </div>
</body>
</html>`;
}
