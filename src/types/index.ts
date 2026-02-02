export enum NetworkType {
    MAINNET = 'mainnet',
    TESTNET = 'testnet',
}
import { Request } from 'express';
import { User } from '../entities/User';

export interface AuthRequest extends Request {
    user?: User;
}

export interface JWTPayload {
    userId: string;
    email: string;
    iat?: number;
    exp?: number;
}

export enum KYCStatus {
    PENDING = 'pending',
    APPROVED = 'approved',
    REJECTED = 'rejected',
}

export enum ChainType {
    ETHEREUM = 'ethereum',
    BITCOIN = 'bitcoin',
    POLYGON = 'polygon',
    BSC = 'bsc',
    SOLANA = 'solana',
    STARKNET = 'starknet',
    STELLAR = 'stellar',
    POLKADOT = 'polkadot',
    USDT_ERC20 = 'usdt_erc20',
    USDT_TRC20 = 'usdt_trc20',
}

export enum NotificationType {
    LOGIN = 'login',
    LOGOUT = 'logout',
    REGISTRATION = 'registration',
    SEND_MONEY = 'send_money',
    RECEIVE_MONEY = 'receive_money',
    SWAP = 'swap',
    DEPOSIT = 'deposit',
    WITHDRAWAL = 'withdrawal',
    OTP_VERIFIED = 'otp_verified',
    PASSWORD_CHANGE = 'password_change',
    SECURITY_ALERT = 'security_alert',
    CONVERSION_STARTED = 'conversion_started',
    CONVERSION_COMPLETED = 'conversion_completed',
    CONVERSION_FAILED = 'conversion_failed',
    CONVERSION_CANCELLED = 'conversion_cancelled',
    QR_PAYMENT_CREATED = 'qr_payment_created',
    QR_PAYMENT_RECEIVED = 'qr_payment_received',
    AIRTIME_PURCHASE = 'airtime_purchase',
    DATA_PURCHASE = 'data_purchase',
    UTILITY_PAYMENT = 'utility_payment',
    PURCHASE_FAILED = 'purchase_failed',
    SEND = "Payment sent",
        DEPLOY = 'DEPLOY',
        QR_PAYMENT_COMPLETED="QR_PAYMENT_COMPLETED",
        CANCELLED="CANCELLED"
}
