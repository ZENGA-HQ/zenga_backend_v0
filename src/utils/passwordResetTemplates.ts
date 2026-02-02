const colors = {
    primary: '#2563eb',
    background: '#eaf1ff',
    card: '#fff',
    text: '#000',
    warning: '#dc2626',
};

/**
 * Password reset request email template
 * @param email User's email address
 * @param resetToken 6-digit reset code
 * @returns HTML email template
 */
export function passwordResetRequestTemplate(
    email: string,
    resetToken: string
): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Password Reset Request</title>
</head>
<body style="background:${colors.background}; font-family:Arial,sans-serif; color:${colors.text}; margin:0; padding:0;">
  <div style="max-width:500px; margin:40px auto; background:${colors.card}; border-radius:8px; box-shadow:0 2px 8px ${colors.primary}22; padding:32px;">
    <div style="text-align:center; margin-bottom:24px;">
      <h2 style="color:${colors.primary}; margin:16px 0 0;">Password Reset Request</h2>
    </div>
    <div style="font-size:16px; margin-bottom:24px;">
      <p>Hello,</p>
      <p>You have requested to reset your password for your Velo account (<strong>${email}</strong>).</p>
      <div style="background:${colors.background}; padding:20px; border-radius:6px; text-align:center; margin:20px 0;">
        <h1 style="color:${colors.primary}; margin:0; font-size:32px; letter-spacing:4px;">${resetToken}</h1>
        <p style="margin:8px 0 0; color:#666; font-size:14px;">Reset Code</p>
      </div>
      <p><strong>Important:</strong></p>
      <ul style="color:#666;">
        <li>This code will expire in <strong>15 minutes</strong></li>
        <li>Use this code only on the official Velo website</li>
        <li>Never share this code with anyone</li>
      </ul>
      <p style="color:${colors.warning};">If you didn't request this reset, please ignore this email and your password will remain unchanged.</p>
    </div>
    <div style="margin-top:32px; font-size:12px; color:#888; text-align:center;">
      &copy; 2025 Velo. All rights reserved.<br>
      <span style="color:#aaa;">This is an automated message, please do not reply.</span>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Password changed confirmation email template
 * @param email User's email address
 * @returns HTML email template
 */
export function passwordChangedTemplate(email: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Password Changed Successfully</title>
</head>
<body style="background:${colors.background}; font-family:Arial,sans-serif; color:${colors.text}; margin:0; padding:0;">
  <div style="max-width:500px; margin:40px auto; background:${colors.card}; border-radius:8px; box-shadow:0 2px 8px ${colors.primary}22; padding:32px;">
    <div style="text-align:center; margin-bottom:24px;">
      <div style="width:60px; height:60px; background:#10b981; border-radius:50%; margin:0 auto 16px; display:flex; align-items:center; justify-content:center;">
        <span style="color:white; font-size:24px;">✓</span>
      </div>
      <h2 style="color:${colors.primary}; margin:16px 0 0;">Password Changed Successfully</h2>
    </div>
    <div style="font-size:16px; margin-bottom:24px;">
      <p>Hello,</p>
      <p>Your password for your Velo account (<strong>${email}</strong>) has been successfully changed.</p>
      
      <div style="background:#fef3cd; border-left:4px solid #f59e0b; padding:16px; margin:20px 0; border-radius:4px;">
        <p style="margin:0; color:#92400e;"><strong>Important Security Notice:</strong></p>
        <ul style="margin:8px 0 0; color:#92400e;">
          <li>You'll need to log in again on all devices</li>
          <li>All existing sessions have been terminated</li>
          <li>If you didn't make this change, contact support immediately</li>
        </ul>
      </div>

      <div style="text-align:center; margin:24px 0;">
        <a href="mailto:support@velo.com" style="background:${colors.primary}; color:white; padding:12px 24px; text-decoration:none; border-radius:6px; display:inline-block;">Contact Support</a>
      </div>
    </div>
    <div style="margin-top:32px; font-size:12px; color:#888; text-align:center;">
      &copy; 2025 Velo. All rights reserved.<br>
      <span style="color:#aaa;">This is an automated message, please do not reply.</span>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Get plain text version of password reset request
 * @param email User's email address
 * @param resetToken 6-digit reset code
 * @returns Plain text email content
 */
export function passwordResetRequestText(
    email: string,
    resetToken: string
): string {
    return `Password Reset Request

Hello,

You have requested to reset your password for your Velo account (${email}).

Reset Code: ${resetToken}

Important:
- This code will expire in 15 minutes
- Use this code only on the official Velo website
- Never share this code with anyone

If you didn't request this reset, please ignore this email and your password will remain unchanged.

© 2025 Velo. All rights reserved.
This is an automated message, please do not reply.`;
}

/**
 * Get plain text version of password changed confirmation
 * @param email User's email address
 * @returns Plain text email content
 */
export function passwordChangedText(email: string): string {
    return `Password Changed Successfully

Hello,

Your password for your Velo account (${email}) has been successfully changed.

Important Security Notice:
- You'll need to log in again on all devices
- All existing sessions have been terminated
- If you didn't make this change, contact support immediately at support@velo.com

© 2025 Velo. All rights reserved.
This is an automated message, please do not reply.`;
}
