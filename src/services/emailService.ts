import { sendMailtrapMail } from '../utils/mailtrap';
import { registerTemplate } from '../utils/registerTemplate';
import { otpTemplate } from '../utils/otpTemplate';

export async function sendRegistrationEmails(email: string, otp: string) {
    try {
        await sendMailtrapMail({
            to: email,
            subject: 'Verify your email',
            text: 'Welcome to Velo! Please verify your email address.',
            html: registerTemplate(email),
        });
        await sendMailtrapMail({
            to: email,
            subject: 'Your OTP Code',
            text: `Your OTP code is: ${otp}`,
            html: otpTemplate(email, otp),
        });
    } catch (mailErr) {
        console.error('Mailtrap send error:', mailErr);
    }
}
