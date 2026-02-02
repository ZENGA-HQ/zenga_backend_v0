export function purchaseFailedTemplate(
  purchaseType: string,
  reason: string,
  details?: any
) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Purchase Failed</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:24px;background:#fff;">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:8px;">
    <h2 style="color:#dc2626;margin:0 0 8px;">${purchaseType} Purchase Failed</h2>
    <p style="margin:0 0 12px;">We couldn't complete your ${purchaseType} purchase. Reason: <strong>${reason}</strong></p>
    ${
      details
        ? `<pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px;border-radius:6px">${JSON.stringify(
            details,
            null,
            2
          )}</pre>`
        : ""
    }
    <p style="font-size:12px;color:#777;margin-top:18px;">If you need help, contact support.</p>
  </div>
</body>
</html>`;
}
