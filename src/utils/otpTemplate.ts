const colors = {
    primary: '#2563eb',
    background: '#eaf1ff',
    card: '#fff',
    text: '#000',
};

export function otpTemplate(email: string, otp: string) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset=\"UTF-8\">
  <title>Verify Your Email</title>
</head>
<body style=\"background:${colors.background}; font-family:Arial,sans-serif; color:${colors.text}; margin:0; padding:0;\">
  <div style=\"max-width:500px; margin:40px auto; background:${colors.card}; border-radius:8px; box-shadow:0 2px 8px ${colors.primary}22; padding:32px;\">
    <div style=\"text-align:center; margin-bottom:24px;\">
      <h2 style=\"color:${colors.primary}; margin:16px 0 0;\">Verify Your Email</h2>
    </div>
    <div style=\"font-size:16px; margin-bottom:24px;\">
      <p>Your verification code is:</p><h1 style=\"color:${colors.primary};\">${otp}</h1><p>Enter this code in the app to verify your email address for ${email}.</p>
    </div>
    <div style=\"margin-top:32px; font-size:12px; color:#888; text-align:center;\">
      &copy; 2025 Velo. All rights reserved.
    </div>
  </div>
</body>
</html>`;
}
