import { AppDataSource } from '../config/database';
import { Notification } from '../entities/Notification';
import { NotificationType } from '../types';
import { User } from '../entities/User';
import { sendMailtrapMail } from '../utils/mailtrap';
import { registrationTemplate } from '../utils/templates/registrationTemplate';
import { depositTemplate } from '../utils/templates/depositTemplate';
import { withdrawalTemplate } from '../utils/templates/withdrawalTemplate';
import { purchaseTemplate } from '../utils/templates/purchaseTemplate';
import { purchaseFailedTemplate } from '../utils/templates/purchaseFailedTemplate';
import { loginTemplate } from '../utils/templates/loginTemplate';
import { qrPaymentTemplate } from '../utils/templates/qrPaymentTemplate';
import { logoutNotificationTemplate } from '../utils/logoutNotificationTemplate';

const MAIL_NOTIFICATIONS_ENABLED = process.env.MAIL_NOTIFICATIONS_ENABLED !== 'false';

export class NotificationService {
    /**
     * Create a notification for a user
     */
    static async createNotification(
        userId: string,
        type: NotificationType,
        title: string,
        message: string,
        details?: any
    ): Promise<Notification> {
        const notificationRepo = AppDataSource.getRepository(Notification);
        const notification = notificationRepo.create({
            userId,
            type,
            title,
            message,
            details,
            isRead: false,
        });
        const saved = await notificationRepo.save(notification);

        // Send an email copy for important notification types if enabled and user has email
        if (MAIL_NOTIFICATIONS_ENABLED) {
            try {
                const userRepo = AppDataSource.getRepository(User);
                const user = await userRepo.findOne({ where: { id: userId } });
                if (user && user.email) {
                    // Select template by notification type
                    let html = `<p>${message}</p>`;
                    let text = typeof message === 'string' ? message : JSON.stringify(message);

                    try {
                        switch (type) {
                            case NotificationType.REGISTRATION:
                                html = registrationTemplate(user.email || '');
                                break;
                            case NotificationType.DEPOSIT:
                                html = depositTemplate(details?.amount || '', details?.currency || '', details);
                                break;
                            case NotificationType.WITHDRAWAL:
                                html = withdrawalTemplate(details?.amount || '', details?.currency || '', details);
                                break;
                            case NotificationType.AIRTIME_PURCHASE:
                            case NotificationType.DATA_PURCHASE:
                            case NotificationType.UTILITY_PAYMENT:
                                html = purchaseTemplate(title, message, details);
                                break;
                            case NotificationType.PURCHASE_FAILED:
                                html = purchaseFailedTemplate(details?.purchaseType || 'Purchase', details?.reason || message, details);
                                break;
                            case NotificationType.LOGIN:
                                html = loginTemplate(user.email || '');
                                break;
                            case NotificationType.LOGOUT:
                                html = logoutNotificationTemplate(user.email || '');
                                break;
                            case NotificationType.QR_PAYMENT_CREATED:
                            case NotificationType.QR_PAYMENT_RECEIVED:
                            case (NotificationType as any).QR_PAYMENT_COMPLETED:
                                html = qrPaymentTemplate(title, details?.amount || details?.value || '', details?.currency || details?.currencyCode || '');
                                break;
                            default:
                                // leave default simple html
                                break;
                        }
                    } catch (tplErr) {
                        console.error('Error rendering notification template', tplErr);
                    }

                    // Send email asynchronously but do not block the response path.
                    sendMailtrapMail({
                        to: user.email,
                        subject: title,
                        text,
                        html,
                    }).catch((err) => {
                        console.error('Failed to send Mailtrap email for notification', err);
                    });
                }
            } catch (err) {
                // Fail silently - notification was already persisted
                console.error('Error while attempting to send notification email:', err);
            }
        }

        return saved;
    }

    /**
     * Create login notification
     */
    static async notifyLogin(
        userId: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.LOGIN,
            'Login Successful',
            'You have successfully logged into your Velo account.',
            details
        );
    }

    /**
     * Create logout notification
     */
    static async notifyLogout(
        userId: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.LOGOUT,
            'Logout Successful',
            'You have successfully logged out of your Velo account.',
            details
        );
    }

    /**
     * Create registration notification
     */
    static async notifyRegistration(
        userId: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.REGISTRATION,
            'Welcome to Velo!',
            'Your account has been successfully created. Welcome to the Velo multi-chain wallet!',
            details
        );
    }

    /**
     * Create send money notification
     */
    static async notifySendMoney(
        userId: string,
        amount: string,
        currency: string,
        toAddress: string,
        txHash?: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.SEND_MONEY,
            'Money Sent',
            `You sent ${amount} ${currency} to ${toAddress.substring(
                0,
                10
            )}...`,
            { amount, currency, toAddress, txHash, ...details }
        );
    }

    /**
     * Create receive money notification
     */
    static async notifyReceiveMoney(
        userId: string,
        amount: string,
        currency: string,
        fromAddress: string,
        txHash?: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.RECEIVE_MONEY,
            'Money Received',
            `You received ${amount} ${currency} from ${fromAddress.substring(
                0,
                10
            )}...`,
            { amount, currency, fromAddress, txHash, ...details }
        );
    }

    /**
     * Create swap notification
     */
    static async notifySwap(
        userId: string,
        fromAmount: string,
        fromCurrency: string,
        toAmount: string,
        toCurrency: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.SWAP,
            'Swap Completed',
            `You swapped ${fromAmount} ${fromCurrency} for ${toAmount} ${toCurrency}`,
            { fromAmount, fromCurrency, toAmount, toCurrency, ...details }
        );
    }

    /**
     * Create OTP verified notification
     */
    static async notifyOTPVerified(
        userId: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.OTP_VERIFIED,
            'Email Verified',
            'Your email has been successfully verified.',
            details
        );
    }

    /**
     * Create security alert notification
     */
    static async notifySecurityAlert(
        userId: string,
        alertMessage: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.SECURITY_ALERT,
            'Security Alert',
            alertMessage,
            details
        );
    }

    /**
     * Create deposit notification
     */
    static async notifyDeposit(
        userId: string,
        amount: string,
        currency: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.DEPOSIT,
            'Deposit Successful',
            `Your deposit of ${amount} ${currency} has been processed.`,
            { amount, currency, ...details }
        );
    }

    /**
     * Create withdrawal notification
     */
    static async notifyWithdrawal(
        userId: string,
        amount: string,
        currency: string,
        details?: any
    ): Promise<Notification> {
        return this.createNotification(
            userId,
            NotificationType.WITHDRAWAL,
            'Withdrawal Successful',
            `Your withdrawal of ${amount} ${currency} has been processed.`,
            { amount, currency, ...details }
        );
    }

    /**
     * Create airtime purchase notification
     */
    static async notifyAirtimePurchase(
        userId: string,
        amount: string,
        currency: string,
        mobileNumber: string,
        network?: string,
        details?: any
    ): Promise<Notification> {
        const title = 'Airtime Purchase Successful';
        const message = `Your airtime purchase of ${amount} ${currency} for ${mobileNumber}${network ? ` on ${network}` : ''} was successful.`;
        return this.createNotification(
            userId,
            NotificationType.AIRTIME_PURCHASE,
            title,
            message,
            { amount, currency, mobileNumber, network, ...details }
        );
    }

    /**
     * Create data purchase notification
     */
    static async notifyDataPurchase(
        userId: string,
        planName: string,
        amount: string,
        currency: string,
        mobileNumber: string,
        network?: string,
        details?: any
    ): Promise<Notification> {
        const title = 'Data Purchase Successful';
        const message = `Your data purchase (${planName}) of ${amount} ${currency} for ${mobileNumber}${network ? ` on ${network}` : ''} was successful.`;
        return this.createNotification(
            userId,
            NotificationType.DATA_PURCHASE,
            title,
            message,
            { planName, amount, currency, mobileNumber, network, ...details }
        );
    }

    /**
     * Create utility (electricity) purchase notification
     */
    static async notifyUtilityPurchase(
        userId: string,
        amount: string,
        currency: string,
        meterNumber: string,
        company?: string,
        details?: any
    ): Promise<Notification> {
        const title = 'Utility Payment Successful';
        const message = `Your utility payment of ${amount} ${currency} for meter ${meterNumber}${company ? ` (${company})` : ''} was successful.`;
        return this.createNotification(
            userId,
            NotificationType.UTILITY_PAYMENT,
            title,
            message,
            { amount, currency, meterNumber, company, ...details }
        );
    }

    /**
     * Generic purchase failed notification
     */
    static async notifyPurchaseFailed(
        userId: string,
        purchaseType: NotificationType,
        reason: string,
        details?: any
    ): Promise<Notification> {
        const title = 'Purchase Failed';
        const message = `Your ${purchaseType} purchase failed: ${reason}`;
        return this.createNotification(
            userId,
            NotificationType.PURCHASE_FAILED,
            title,
            message,
            { reason, ...details }
        );
    }
}
