// src/services/shared/purchaseUtils.ts
import { Repository } from "typeorm";
import { AppDataSource } from "../config/database";
import { AirtimePurchase } from "../entities/AirtimePurchase";
import { DataPurchase } from "../entities/DataPurchase";
import { ElectricityPurchase } from "../entities/ElectricityPurchase";
import { blockchainValidator } from "../services/blockchain/validators";
import { exchangeRateService } from "../services/exchangeRateService";

export enum Blockchain {
  ETHEREUM = "ethereum",
  BITCOIN = "bitcoin",
  SOLANA = "solana",
  STELLAR = "stellar",
  POLKADOT = "polkadot",
  STARKNET = "starknet",
  USDT_ERC20 = "usdt-erc20",
}

export enum MobileNetwork {
  MTN = "mtn",
  GLO = "glo",
  AIRTEL = "airtel",
  ETISALAT = "9mobile",
}

// Shared constants
export const SECURITY_CONSTANTS = {
  AMOUNT_TOLERANCE_PERCENT: 1.0, // 1% tolerance
  PURCHASE_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
  MIN_AIRTIME_AMOUNT: 50,
  MAX_AIRTIME_AMOUNT: 200000,
  MIN_DATA_AMOUNT: 50,
  MAX_DATA_AMOUNT: 200000,
  MIN_ELECTRICITY_AMOUNT: 1000,
  MAX_ELECTRICITY_AMOUNT: 200000,
};

// Mock crypto rates (fallback)
const MOCK_CRYPTO_RATES: { [key in Blockchain]: number } = {
  [Blockchain.ETHEREUM]: 2000000,
  [Blockchain.BITCOIN]: 60000000,
  [Blockchain.SOLANA]: 269800,
  [Blockchain.STELLAR]: 500,
  [Blockchain.POLKADOT]: 10000,
  [Blockchain.STARKNET]: 260.64,
  [Blockchain.USDT_ERC20]: 1430,
};

// Crypto ID mapping
const CRYPTO_ID_MAP: { [key in Blockchain]: string } = {
  [Blockchain.ETHEREUM]: "eth",
  [Blockchain.BITCOIN]: "btc",
  [Blockchain.SOLANA]: "sol",
  [Blockchain.STELLAR]: "xlm",
  [Blockchain.POLKADOT]: "dot",
  [Blockchain.STARKNET]: "strk",
  [Blockchain.USDT_ERC20]: "usdt",
};

/**
 * SHARED: Get blockchain wallet address
 */
export function getBlockchainWallet(blockchain: Blockchain): string {
  const walletMap: { [key in Blockchain]: string | undefined } = {
    [Blockchain.ETHEREUM]: process.env.VELO_TREASURY_ETH_MAINNET,
    [Blockchain.BITCOIN]: process.env.VELO_TREASURY_BTC_MAINNET,
    [Blockchain.SOLANA]: process.env.VELO_TREASURY_SOL_MAINNET,
    [Blockchain.STELLAR]: process.env.VELO_TREASURY_XLM_MAINNET,
    [Blockchain.POLKADOT]: process.env.VELO_TREASURY_DOT_MAINNET,
    [Blockchain.STARKNET]: process.env.VELO_TREASURY_STRK_MAINNET,
    [Blockchain.USDT_ERC20]: process.env.VELO_TREASURY_USDT_MAINNET,
  };

  const walletAddress = walletMap[blockchain];
  if (!walletAddress) {
    throw new Error(`Wallet not configured for blockchain: ${blockchain}`);
  }

  return walletAddress;
}

/**
 * SHARED: Convert fiat to crypto with fallback to mock rates
 */
export async function convertFiatToCrypto(
  fiatAmount: number,
  blockchain: Blockchain
): Promise<number> {
  try {
    const cryptoId = CRYPTO_ID_MAP[blockchain];
    if (!cryptoId) {
      throw new Error(`Exchange rate not available for: ${blockchain}`);
    }

    const cryptoAmount = await exchangeRateService.convertFiatToCrypto(
      fiatAmount,
      cryptoId
    );

    console.log(
      `💰 Exchange rate conversion: ${fiatAmount} NGN = ${cryptoAmount} ${cryptoId.toUpperCase()}`
    );
    return cryptoAmount;
  } catch (error: any) {
    console.error("❌ Exchange rate conversion failed:", error.message);
    console.log("⚠️ Using fallback mock rates");
    return getMockCryptoAmount(fiatAmount, blockchain);
  }
}

/**
 * SHARED: Get mock crypto amount (fallback)
 */
export function getMockCryptoAmount(
  fiatAmount: number,
  blockchain: Blockchain
): number {
  const rate = MOCK_CRYPTO_RATES[blockchain];
  if (!rate) {
    throw new Error(`Exchange rate not available for: ${blockchain}`);
  }

  const cryptoAmount = fiatAmount / rate;
  // Round to 8 decimal places for crypto precision
  return Math.round(cryptoAmount * 100000000) / 100000000;
}

/**
 * SHARED: Validate blockchain transaction with amount tolerance
 */
export async function validateBlockchainTransaction(
  blockchain: Blockchain,
  transactionHash: string,
  expectedAmount: number,
  expectedToAddress: string
): Promise<boolean> {
  console.log(`🔍 Validating ${blockchain} transaction...`);
  console.log(`   TX: ${transactionHash}`);
  console.log(
    `   Expected: ${expectedAmount} ${blockchain} to ${expectedToAddress}`
  );
  console.log(`   Tolerance: ${SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT}%`);

  const MAX_RETRIES = 12; // Approx 1 minute total wait time
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`⏳ Retry ${attempt}/${MAX_RETRIES} for ${blockchain} transaction...`);
      }

      const tolerance =
        expectedAmount * (SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT / 100);
      const minAllowedAmount = expectedAmount - tolerance;
      const maxAllowedAmount = expectedAmount + tolerance;

      console.log(
        `   Amount range: ${minAllowedAmount} - ${maxAllowedAmount} ${blockchain}`
      );

      let isValid = false;

      switch (blockchain) {
        case Blockchain.ETHEREUM:
          isValid = await blockchainValidator.validateEthereumTransaction(
            transactionHash,
            expectedToAddress,
            minAllowedAmount,
            maxAllowedAmount
          );
          break;

        case Blockchain.BITCOIN:
          isValid = await blockchainValidator.validateBitcoinTransaction(
            transactionHash,
            expectedToAddress,
            minAllowedAmount,
            maxAllowedAmount
          );
          break;

        case Blockchain.SOLANA:
          isValid = await blockchainValidator.validateSolanaTransaction(
            transactionHash,
            expectedToAddress,
            minAllowedAmount,
            maxAllowedAmount
          );
          break;

        case Blockchain.STELLAR:
          isValid = await blockchainValidator.validateStellarTransaction(
            transactionHash,
            expectedToAddress,
            minAllowedAmount,
            maxAllowedAmount
          );
          break;

        case Blockchain.POLKADOT:
          isValid = await blockchainValidator.validatePolkadotTransaction(
            transactionHash,
            expectedToAddress,
            minAllowedAmount,
            maxAllowedAmount
          );
          break;

        case Blockchain.STARKNET:
          isValid = await blockchainValidator.validateStarknetTransaction(
            transactionHash,
            expectedToAddress,
            minAllowedAmount,
            maxAllowedAmount
          );
          break;

        case Blockchain.USDT_ERC20:
          isValid = await blockchainValidator.validateUsdtTransaction(
            transactionHash,
            expectedToAddress,
            minAllowedAmount,
            maxAllowedAmount
          );
          break;

        default:
          console.error(`Unsupported blockchain: ${blockchain}`);
          return false;
      }

      if (isValid) {
        console.log(`✅ Transaction validated successfully on attempt ${attempt}`);
        return true;
      } else {
        // If it's the last attempt, log failure
        if (attempt === MAX_RETRIES) {
          console.log(`❌ Transaction validation failed after ${MAX_RETRIES} attempts`);
        }
      }

    } catch (error: any) {
      console.error(`❌ Blockchain validation error on attempt ${attempt}:`, error.message);
    }

    // Wait before retrying, if not the last attempt
    if (attempt < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return false;
}

/**
 * SHARED: Check if transaction hash has been successfully used
 * Only checks transactions that completed successfully (COMPLETED status)
 */
export async function checkTransactionHashUniqueness(
  transactionHash: string
): Promise<void> {
  // Check across all purchase types for COMPLETED transactions only
  const airtimeRepo = AppDataSource.getRepository(AirtimePurchase);
  const dataRepo = AppDataSource.getRepository(DataPurchase);
  const electricityRepo = AppDataSource.getRepository(ElectricityPurchase);

  const [existingAirtime, existingData, existingElectricity] = await Promise.all([
    airtimeRepo.findOne({
      where: {
        transaction_hash: transactionHash,
        status: "completed" as any,
      },
    }),
    dataRepo.findOne({
      where: {
        transaction_hash: transactionHash,
        status: "completed" as any,
      },
    }),
    electricityRepo.findOne({
      where: {
        transaction_hash: transactionHash,
        status: "completed" as any,
      },
    }),
  ]);

  if (existingAirtime) {
    logSecurityEvent("DUPLICATE_TRANSACTION_HASH", {
      transactionHash,
      existingType: "airtime",
      existingId: existingAirtime.id,
    });
    throw new Error(
      "This transaction has already been used for a successful airtime purchase"
    );
  }

  if (existingData) {
    logSecurityEvent("DUPLICATE_TRANSACTION_HASH", {
      transactionHash,
      existingType: "data",
      existingId: existingData.id,
    });
    throw new Error(
      "This transaction has already been used for a successful data purchase"
    );
  }

  if (existingElectricity) {
    logSecurityEvent("DUPLICATE_TRANSACTION_HASH", {
      transactionHash,
      existingType: "electricity",
      existingId: existingElectricity.id,
    });
    throw new Error(
      "This transaction has already been used for a successful electricity payment"
    );
  }

  console.log("✅ Transaction hash is unique (no successful purchases found)");
}

/**
 * SHARED: Mark transaction hash as used (called only after successful Nellobytes response)
 * This is implicit - the purchase status is set to COMPLETED only after Nellobytes succeeds
 */
export function markTransactionAsUsed(purchaseId: string, purchaseType: string) {
  console.log(`✅ Transaction marked as used for ${purchaseType} purchase: ${purchaseId}`);
  // The actual marking happens by setting status to COMPLETED in the database
  // This function is just for logging/tracking purposes
}

/**
 * SHARED: Common input validation
 */
export function validateCommonInputs(data: {
  phoneNumber: string;
  chain: Blockchain;
  transactionHash: string;
  amount: number;
  minAmount: number;
  maxAmount: number;
}) {
  const { phoneNumber, chain, transactionHash, amount, minAmount, maxAmount } =
    data;

  // Amount validation
  if (typeof amount !== "number" || isNaN(amount)) {
    throw new Error("Amount must be a valid number");
  }

  if (amount < minAmount) {
    throw new Error(`Minimum amount is ${minAmount} NGN`);
  }

  if (amount > maxAmount) {
    throw new Error(`Maximum amount is ${maxAmount} NGN`);
  }

  // Phone number validation (Nigeria)
  const phoneRegex = /^234[7-9][0-9]{9}$/;
  if (!phoneRegex.test(phoneNumber)) {
    throw new Error(
      "Invalid Nigerian phone number format. Use 234XXXXXXXXXX"
    );
  }

  // Blockchain validation
  if (!Object.values(Blockchain).includes(chain)) {
    throw new Error(
      `Unsupported blockchain. Supported: ${Object.values(Blockchain).join(
        ", "
      )}`
    );
  }

  // Transaction hash validation
  if (!transactionHash || typeof transactionHash !== "string") {
    throw new Error("Valid transaction hash is required");
  }

  if (transactionHash.length < 10) {
    throw new Error("Invalid transaction hash format");
  }
}

/**
 * SHARED: Map Nellobytes error codes to user-friendly messages
 */
export function mapNellobytesError(
  statusCode: string | undefined,
  status: string
): string {
  const errorMap: { [key: string]: string } = {
    // Authentication errors
    "400": "Nellobytes: Invalid API credentials.",
    "401": "Nellobytes: Invalid URL format.",
    "402": "Nellobytes: UserID is missing.",
    "403": "Nellobytes: API Key is missing.",
    "404": "Nellobytes: Mobile network is not specified.",
    "405": "Nellobytes: Amount is missing.",
    "406": "Nellobytes: Invalid amount specified.",
    "407": "Nellobytes: Minimum amount is ₦100.",
    "408": "Nellobytes: Minimum amount is ₦50,000.",
    "409": "Nellobytes: Invalid recipient phone number.",
    "412": "Nellobytes: Insufficient API balance.",
    "413": "Nellobytes: Invalid API configuration.",
    "418": "Nellobytes: Invalid mobile network.",

    // Text-based status mappings
    INVALID_CREDENTIALS: "Nellobytes: Invalid API credentials.",
    MISSING_CREDENTIALS: "Nellobytes: API credentials missing.",
    MISSING_USERID: "Nellobytes: User ID missing.",
    MISSING_APIKEY: "Nellobytes: API key missing.",
    MISSING_MOBILENETWORK: "Nellobytes: Mobile network not specified.",
    MISSING_AMOUNT: "Nellobytes: Amount not specified.",
    INVALID_AMOUNT: "Nellobytes: Invalid amount specified.",
    MINIMUM_50: "Nellobytes: Minimum airtime amount is 50 NGN.",
    MINIMUM_200000: "Nellobytes: Maximum airtime amount is 200,000 NGN.",
    MINIMUM_AMOUNT: "Nellobytes: Amount below minimum.",
    INVALID_RECIPIENT: "Nellobytes: Invalid phone number format.",
    INVALID_PRODUCT_CODE: "Nellobytes: Invalid product selected.",
    INVALID_DATAPLAN: "Nellobytes: Invalid data plan selected.",
    INVALID_METER_NUMBER: "Nellobytes: Invalid meter number.",
    INVALID_COMPANY: "Nellobytes: Invalid electricity company.",
    SERVICE_TEMPORARILY_UNAVAIALBLE:
      "Nellobytes: Service temporarily unavailable. Please try again later.",
    INSUFFICIENT_APIBALANCE:
      "Nellobytes: Insufficient provider balance. Please try again later.",
    AUTHENTICATION_FAILED_0: "Nellobytes: Authentication failed.",
  };

  // Check status code mapping
  if (statusCode && errorMap[statusCode]) {
    return errorMap[statusCode];
  }

  // Check status text mapping
  if (errorMap[status]) {
    return errorMap[status];
  }

  // Success codes
  const successCodes = ["100", "200", "00", "300", "201"];
  if (statusCode && successCodes.includes(statusCode)) {
    return `Nellobytes: Processing - ${status}`;
  }

  // Order on hold (600 series)
  if (statusCode && statusCode.startsWith("6")) {
    return `Nellobytes: Order on hold - ${status}. Please try again later.`;
  }

  // Cancelled orders (500 series)
  if (statusCode && statusCode.startsWith("5")) {
    return `Nellobytes: Order cancelled - ${status}`;
  }

  // Generic error
  if (
    statusCode &&
    statusCode !== "100" &&
    statusCode !== "200" &&
    statusCode !== "00"
  ) {
    return `Nellobytes: Service error (Code: ${statusCode}) - ${status}`;
  }

  return `Nellobytes: ${status}`;
}

/**
 * SHARED: Initiate refund
 */
export async function initiateRefund<T extends { metadata?: any }>(
  purchase: T,
  repository: Repository<T>,
  cryptoAmount: number,
  cryptoCurrency: string,
  reason: string,
  purchaseId: string
): Promise<void> {
  try {
    console.log(`💸 Initiating refund for purchase ${purchaseId}: ${reason}`);

    purchase.metadata = {
      ...purchase.metadata,
      refund: {
        initiated: true,
        reason: reason,
        initiatedAt: new Date().toISOString(),
        amount: cryptoAmount,
        currency: cryptoCurrency,
        status: "pending",
      },
    };

    await repository.save(purchase);

    console.log(`✅ Refund initiated for ${cryptoAmount} ${cryptoCurrency}`);
  } catch (error) {
    console.error("❌ Refund initiation failed:", error);
  }
}

/**
 * SHARED: Log security events
 */
export function logSecurityEvent(event: string, details: any) {
  console.warn(`🔒 SECURITY EVENT: ${event}`, {
    timestamp: new Date().toISOString(),
    event,
    details,
  });

  // TODO: Send to security monitoring service
  // await sendToSecurityMonitoring(event, details);
}

/**
 * SHARED: Get supported blockchains
 */
export function getSupportedBlockchains() {
  return Object.values(Blockchain).map((chain) => ({
    chain: chain,
    symbol: chain.toUpperCase(),
    name:
      chain.charAt(0).toUpperCase() +
      chain.slice(1).replace("_", " ").replace("-", " "),
  }));
}

/**
 * SHARED: Get supported networks
 */
export function getSupportedNetworks() {
  return Object.values(MobileNetwork).map((network) => ({
    value: network,
    label: network.toUpperCase(),
    name: network.charAt(0).toUpperCase() + network.slice(1),
  }));
}

/**
 * SHARED: Get security limits
 */
export function getSecurityLimits() {
  return {
    airtime: {
      minAmount: SECURITY_CONSTANTS.MIN_AIRTIME_AMOUNT,
      maxAmount: SECURITY_CONSTANTS.MAX_AIRTIME_AMOUNT,
    },
    data: {
      minAmount: SECURITY_CONSTANTS.MIN_DATA_AMOUNT,
      maxAmount: SECURITY_CONSTANTS.MAX_DATA_AMOUNT,
    },
    electricity: {
      minAmount: SECURITY_CONSTANTS.MIN_ELECTRICITY_AMOUNT,
      maxAmount: SECURITY_CONSTANTS.MAX_ELECTRICITY_AMOUNT,
    },
    amountTolerancePercent: SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT,
    purchaseExpiryMinutes: SECURITY_CONSTANTS.PURCHASE_EXPIRY_MS / (60 * 1000),
  };
}