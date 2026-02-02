// src/types/pajRamp.d.ts
declare module 'paj_ramp' {
  export enum Environment {
    Staging = 'staging',
    Production = 'production',
  }

  export enum Currency {
    NGN = 'NGN',
    USD = 'USD',
  }

  export enum TransactionStatus {
    INIT = 'INIT',
    PAID = 'PAID',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
  }

  export enum TransactionType {
    ON_RAMP = 'ON_RAMP',
    OFF_RAMP = 'OFF_RAMP',
  }

  export function initializeSDK(env: Environment): void;

  export function initiate(emailOrPhone: string, apiKey: string): Promise<{ email?: string; phone?: string }>;

  export function verify(
    emailOrPhone: string,
    otp: string,
    deviceInfo: {
      uuid: string;
      device: string;
      os?: string;
      browser?: string;
      ip?: string;
    },
    apiKey: string
  ): Promise<{
    email?: string;
    phone?: string;
    isActive: boolean;
    expiresAt: string;
    token: string;
  }>;

  export function createOrder(
    params: {
      fiatAmount: number;
      currency: Currency | string;
      recipient: string;
      mint: string;
      chain: string;
      webhookURL?: string;
    },
    token: string
  ): Promise<any>;

  export function createOfframpOrder(
    params: {
      bank: string;
      accountNumber: string;
      currency: Currency | string;
      amount: number;
      mint: string;
      webhookURL?: string;
    },
    token: string
  ): Promise<any>;

  export function getBanks(token: string): Promise<Array<{ id: string; name: string; country: string }>>;

  export function resolveBankAccount(token: string, bankId: string, accountNumber: string): Promise<any>;

  export function addBankAccount(token: string, bankId: string, accountNumber: string): Promise<any>;

  export function getAllRate(): Promise<any>;

  export function getAllTransactions(token: string): Promise<any[]>;
}