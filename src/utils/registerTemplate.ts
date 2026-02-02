const colors = {
    primary: '#2563eb',
    background: '#eaf1ff',
    card: '#fff',
    text: '#000',
};

export function registerTemplate(name: string) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Welcome to Velo!</title>
</head>
<body style="background:${colors.background}; font-family:Arial,sans-serif; color:${colors.text}; margin:0; padding:0;">
  <div style="max-width:500px; margin:40px auto; background:${colors.card}; border-radius:8px; box-shadow:0 2px 8px ${colors.primary}22; padding:32px;">
    <div style="text-align:center; margin-bottom:24px;">
      <h2 style="color:${colors.primary}; margin:16px 0 0;">Welcome to Velo!</h2>
    </div>
    <div style="font-size:16px; margin-bottom:24px;">
      <p>Welcome to Velo, <b>${name}</b>!</p><p>We're excited to have you on board. Start managing your crypto payments and splits now.</p>
    </div>
    <div style="margin-top:32px; font-size:12px; color:#888; text-align:center;">
      &copy; 2025 Velo. All rights reserved.
    </div>
  </div>
</body>
</html>`;
}
