// src/services/airtimeService.ts - REFACTORED
import { Repository } from "typeorm";
import { AppDataSource } from "../config/database";
import { NotificationService } from "./notificationService";
import { NotificationType } from "../types";
import {
  AirtimePurchase,
  AirtimePurchaseStatus,
} from "../entities/AirtimePurchase";
import nellobytesService, { isSuccessfulResponse } from "./nellobytesService";
import {
  Blockchain,
  MobileNetwork,
  SECURITY_CONSTANTS,
  getBlockchainWallet,
  convertFiatToCrypto,
  validateBlockchainTransaction,
  checkTransactionHashUniqueness,
  markTransactionAsUsed,
  validateCommonInputs,
  mapNellobytesError,
  initiateRefund,
  logSecurityEvent,
  getSupportedBlockchains,
  getSupportedNetworks,
  getSecurityLimits,
} from "../utils/purchaseUtils";

export class AirtimeService {
  private airtimePurchaseRepo: Repository<AirtimePurchase>;

  constructor() {
    this.airtimePurchaseRepo = null as any;
  }

  private getRepository(): Repository<AirtimePurchase> {
    if (!this.airtimePurchaseRepo) {
      this.airtimePurchaseRepo = AppDataSource.getRepository(AirtimePurchase);
    }
    return this.airtimePurchaseRepo;
  }

  /**
   * Process airtime purchase with comprehensive validation
   */
  async processAirtimePurchase(
    userId: string,
    purchaseData: {
      type: "airtime";
      amount: number;
      chain?: Blockchain;  // Optional for fiat payments
      phoneNumber: string;
      mobileNetwork: MobileNetwork;
      transactionHash?: string;  // Optional for fiat payments
    }
  ) {
    console.log(
      `🔄 Processing airtime purchase for user ${userId}:`,
      purchaseData
    );

    let airtimePurchase: AirtimePurchase | null = null;

    try {
      // 1. Validate inputs
      this.validatePurchaseData(purchaseData);

      const isCryptoPayment = !!purchaseData.chain && !!purchaseData.transactionHash;
      let expectedCryptoAmount = 0;
      let receivingWallet = '';

      if (isCryptoPayment) {
        // 2. Check transaction hash uniqueness (only for crypto payments)
        await checkTransactionHashUniqueness(purchaseData.transactionHash!);

        // 3. Convert fiat to crypto
        expectedCryptoAmount = await convertFiatToCrypto(
          purchaseData.amount,
          purchaseData.chain!
        );

        // 4. Get receiving wallet
        receivingWallet = getBlockchainWallet(purchaseData.chain!);

        console.log(
          `💰 Expected: ${expectedCryptoAmount} ${purchaseData.chain} to ${receivingWallet}`
        );
      } else {
        console.log(`💵 Processing fiat payment for ${purchaseData.amount} NGN`);
      }

      // 5. Create pending purchase record
      airtimePurchase = new AirtimePurchase();
      airtimePurchase.user_id = userId;
      airtimePurchase.network = purchaseData.mobileNetwork;
      airtimePurchase.blockchain = purchaseData.chain || 'fiat';
      airtimePurchase.crypto_amount = expectedCryptoAmount;
      airtimePurchase.crypto_currency = purchaseData.chain?.toUpperCase() || 'NGN';
      airtimePurchase.fiat_amount = purchaseData.amount;
      airtimePurchase.phone_number = purchaseData.phoneNumber;
      airtimePurchase.transaction_hash = purchaseData.transactionHash || undefined;
      airtimePurchase.status = AirtimePurchaseStatus.PROCESSING;

      await this.getRepository().save(airtimePurchase);

      if (isCryptoPayment) {
        // 6. Validate blockchain transaction (only for crypto payments)
        console.log(
          `🔍 Validating ${purchaseData.chain} transaction: ${purchaseData.transactionHash}`
        );

        const isValid = await validateBlockchainTransaction(
          purchaseData.chain!,
          purchaseData.transactionHash!,
          expectedCryptoAmount,
          receivingWallet
        );

        if (!isValid) {
          await this.markPurchaseFailed(
            airtimePurchase,
            "Transaction validation failed"
          );
          throw new Error(
            "Transaction validation failed. Please check the transaction details."
          );
        }

        console.log(`✅ Transaction validated! Proceeding to airtime delivery...`);
      } else {
        console.log(`✅ Fiat payment accepted! Proceeding to airtime delivery...`);
      }

      // 7. Process airtime with Nellobytes
      const providerResult = await this.processAirtimeWithNellobytes(
        airtimePurchase
      );

      // 8. Mark as COMPLETED only if Nellobytes succeeded (transaction is now "used")
      airtimePurchase.status = AirtimePurchaseStatus.COMPLETED;
      airtimePurchase.provider_reference = providerResult.orderid;
      airtimePurchase.metadata = {
        providerResponse: providerResult,
        processedAt: new Date().toISOString(),
        security: {
          validatedAt: new Date().toISOString(),
          amountTolerance: SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT,
        },
      };
      await this.getRepository().save(airtimePurchase);

      // Mark transaction as used (for logging)
      markTransactionAsUsed(airtimePurchase.id, "airtime");

      console.log(
        `🎉 Airtime delivered! ${purchaseData.amount} NGN to ${purchaseData.phoneNumber}`
      );

      return {
        success: true,
        message: `Airtime purchase successful! ${purchaseData.amount
          } NGN ${purchaseData.mobileNetwork.toUpperCase()} airtime delivered to ${purchaseData.phoneNumber
          }`,
        data: {
          purchaseId: airtimePurchase.id,
          airtimeAmount: purchaseData.amount,
          network: purchaseData.mobileNetwork,
          phoneNumber: purchaseData.phoneNumber,
          providerReference: providerResult.orderid,
          cryptoAmount: isCryptoPayment ? expectedCryptoAmount : undefined,
          cryptoCurrency: isCryptoPayment ? purchaseData.chain!.toUpperCase() : undefined,
          deliveredAt: new Date(),
        },
      };
    } catch (error: any) {
      console.error("❌ Airtime purchase failed:", error);

      // If we created a purchase record but failed, update its status
      if (airtimePurchase && airtimePurchase.id) {
        await this.markPurchaseFailed(airtimePurchase, error.message);

        // Initiate refund for blockchain-validated but provider-failed transactions
        if (airtimePurchase.status === AirtimePurchaseStatus.PROCESSING) {
          await initiateRefund(
            airtimePurchase,
            this.getRepository(),
            airtimePurchase.crypto_amount,
            airtimePurchase.crypto_currency,
            error.message,
            airtimePurchase.id
          );
        }
      }

      throw error;
    }
  }

  /**
   * Process airtime with Nellobytesystems
   */
  private async processAirtimeWithNellobytes(purchase: AirtimePurchase) {
    try {
      console.log(
        `📞 Calling Nellobytes API for ${purchase.fiat_amount} NGN ${purchase.network} to ${purchase.phone_number}`
      );

      const providerResult = await nellobytesService.purchaseAirtimeSimple(
        purchase.network,
        purchase.fiat_amount,
        purchase.phone_number,
        `VELO_${purchase.id}_${Date.now()}`
      );

      console.log(`📞 Nellobytes API response:`, providerResult);

      // Check for success
      if (
        isSuccessfulResponse(providerResult) ||
        providerResult.status === "ORDER_RECEIVED"
      ) {
        console.log(`✅ Nellobytes order successful: ${providerResult.orderid}`);
        return providerResult;
      } else {
        const errorMessage = mapNellobytesError(
          providerResult.statuscode,
          providerResult.status || ""
        );
        console.error(
          `❌ Nellobytes API error: ${providerResult.statuscode} - ${providerResult.status}`
        );
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error(`❌ Nellobytes API call failed:`, error.message);

      if (error.message.includes("Nellobytes:")) {
        throw error;
      }

      throw new Error(`Nellobytes: ${error.message}`);
    }
  }

  /**
   * Validate purchase data
   */
  private validatePurchaseData(purchaseData: any) {
    const { type, amount, chain, phoneNumber, mobileNetwork, transactionHash } =
      purchaseData;

    // Type validation
    if (type !== "airtime") {
      throw new Error("Invalid purchase type");
    }

    // Network validation
    if (!Object.values(MobileNetwork).includes(mobileNetwork)) {
      throw new Error(
        `Invalid mobile network. Supported: ${Object.values(MobileNetwork).join(
          ", "
        )}`
      );
    }

    // For fiat payments, only validate amount and phone number
    if (!chain && !transactionHash) {
      // Fiat payment validation
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new Error("Invalid phone number");
      }
      if (amount < SECURITY_CONSTANTS.MIN_AIRTIME_AMOUNT || amount > SECURITY_CONSTANTS.MAX_AIRTIME_AMOUNT) {
        throw new Error(
          `Amount must be between ${SECURITY_CONSTANTS.MIN_AIRTIME_AMOUNT} and ${SECURITY_CONSTANTS.MAX_AIRTIME_AMOUNT} NGN`
        );
      }
    } else {
      // Crypto payment validation - full validation including blockchain
      validateCommonInputs({
        phoneNumber,
        chain,
        transactionHash,
        amount,
        minAmount: SECURITY_CONSTANTS.MIN_AIRTIME_AMOUNT,
        maxAmount: SECURITY_CONSTANTS.MAX_AIRTIME_AMOUNT,
      });
    }

    console.log("✅ Input validation passed");
  }

  /**
   * Mark purchase as failed
   */
  private async markPurchaseFailed(purchase: AirtimePurchase, reason: string) {
    purchase.status = AirtimePurchaseStatus.FAILED;
    purchase.metadata = {
      ...purchase.metadata,
      error: reason,
      failedAt: new Date().toISOString(),
      security: {
        validationFailed: true,
        failedAt: new Date().toISOString(),
      },
    };
    await this.getRepository().save(purchase);

    logSecurityEvent("PURCHASE_FAILED", {
      purchaseId: purchase.id,
      reason,
      userId: purchase.user_id,
      fiatAmount: purchase.fiat_amount,
      cryptoAmount: purchase.crypto_amount,
      network: purchase.network,
    });
  }

  // ========== PUBLIC UTILITY METHODS ==========

  async getUserAirtimeHistory(userId: string, limit: number = 10) {
    return await this.getRepository().find({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      take: limit,
    });
  }

  async getExpectedCryptoAmount(fiatAmount: number, chain: Blockchain) {
    if (
      fiatAmount < SECURITY_CONSTANTS.MIN_AIRTIME_AMOUNT ||
      fiatAmount > SECURITY_CONSTANTS.MAX_AIRTIME_AMOUNT
    ) {
      throw new Error(
        `Amount must be between ${SECURITY_CONSTANTS.MIN_AIRTIME_AMOUNT} and ${SECURITY_CONSTANTS.MAX_AIRTIME_AMOUNT} NGN`
      );
    }

    const cryptoAmount = await convertFiatToCrypto(fiatAmount, chain);

    return {
      cryptoAmount,
      cryptoCurrency: chain.toUpperCase(),
      fiatAmount,
      chain,
      minAmount: SECURITY_CONSTANTS.MIN_AIRTIME_AMOUNT,
      maxAmount: SECURITY_CONSTANTS.MAX_AIRTIME_AMOUNT,
      tolerancePercent: SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT,
      instructions: `Send approximately ${cryptoAmount} ${chain.toUpperCase()} from your wallet to complete the airtime purchase`,
    };
  }

  getSupportedBlockchains() {
    return getSupportedBlockchains();
  }

  getSupportedNetworks() {
    return getSupportedNetworks();
  }

  getSecurityLimits() {
    return getSecurityLimits().airtime;
  }

  async getUserPurchaseStats(userId: string) {
    const history = await this.getUserAirtimeHistory(userId, 1000);

    return {
      totalPurchases: history.length,
      totalSpent: history.reduce(
        (sum, purchase) => sum + parseFloat(purchase.fiat_amount.toString()),
        0
      ),
      successfulPurchases: history.filter((p) => p.status === "completed")
        .length,
      averagePurchase:
        history.length > 0
          ? history.reduce(
            (sum, purchase) =>
              sum + parseFloat(purchase.fiat_amount.toString()),
            0
          ) / history.length
          : 0,
    };
  }

  async getRecentPurchases(userId: string, limit: number = 5) {
    return await this.getUserAirtimeHistory(userId, limit);
  }
}

export const airtimeService = new AirtimeService();