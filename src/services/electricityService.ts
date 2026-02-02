// src/services/electricityService.ts - REFACTORED
import { Repository } from "typeorm";
import { AppDataSource } from "../config/database";
import { NotificationService } from "./notificationService";
import { NotificationType } from "../types";
import {
  ElectricityPurchase,
  ElectricityPurchaseStatus,
  ElectricityCompany,
  MeterType,
} from "../entities/ElectricityPurchase";
import nellobytesService, { isSuccessfulResponse } from "./nellobytesService";
import {
  Blockchain,
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
  getSecurityLimits,
} from "../utils/purchaseUtils";

// Company configuration
interface ElectricityCompanyConfig {
  id: string;
  name: string;
  code: string;
  minAmount: number;
  maxAmount: number;
}

export class ElectricityService {
  private electricityPurchaseRepo: Repository<ElectricityPurchase>;

  // Company mappings
  private readonly COMPANY_MAP: {
    [key in ElectricityCompany]: ElectricityCompanyConfig;
  } = {
      [ElectricityCompany.EKO_ELECTRIC]: {
        id: "01",
        name: "Eko Electric - EKEDC (PHCN)",
        code: "01",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.IKEJA_ELECTRIC]: {
        id: "02",
        name: "Ikeja Electric - IKEDC (PHCN)",
        code: "02",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.ABUJA_ELECTRIC]: {
        id: "03",
        name: "Abuja Electric - AEDC",
        code: "03",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.KANO_ELECTRIC]: {
        id: "04",
        name: "Kano Electric - KEDC",
        code: "04",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.PORTHARCOURT_ELECTRIC]: {
        id: "05",
        name: "Portharcourt Electric - PHEDC",
        code: "05",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.JOS_ELECTRIC]: {
        id: "06",
        name: "Jos Electric - JEDC",
        code: "06",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.IBADAN_ELECTRIC]: {
        id: "07",
        name: "Ibadan Electric - IBEDC",
        code: "07",
        minAmount: 2000,
        maxAmount: 200000,
      },
      [ElectricityCompany.KADUNA_ELECTRIC]: {
        id: "08",
        name: "Kaduna Electric - KAEDC",
        code: "08",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.ENUGU_ELECTRIC]: {
        id: "09",
        name: "ENUGU Electric - EEDC",
        code: "09",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.BENIN_ELECTRIC]: {
        id: "10",
        name: "BENIN Electric - BEDC",
        code: "10",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.YOLA_ELECTRIC]: {
        id: "11",
        name: "YOLA Electric - YEDC",
        code: "11",
        minAmount: 1000,
        maxAmount: 200000,
      },
      [ElectricityCompany.ABA_ELECTRIC]: {
        id: "12",
        name: "ABA Electric - APLE",
        code: "12",
        minAmount: 1000,
        maxAmount: 200000,
      },
    };

  constructor() {
    this.electricityPurchaseRepo = null as any;
  }

  private getRepository(): Repository<ElectricityPurchase> {
    if (!this.electricityPurchaseRepo) {
      this.electricityPurchaseRepo =
        AppDataSource.getRepository(ElectricityPurchase);
    }
    return this.electricityPurchaseRepo;
  }

  /**
   * Process electricity payment with comprehensive validation
   */
  async processElectricityPayment(
    userId: string,
    purchaseData: {
      type: "electricity";
      amount: number;
      chain?: Blockchain;
      company: ElectricityCompany;
      meterType: MeterType;
      meterNumber: string;
      phoneNumber: string;
      transactionHash?: string;
    }
  ) {
    console.log(
      `📄 Processing electricity payment for user ${userId}:`,
      purchaseData
    );

    let electricityPurchase: ElectricityPurchase | null = null;

    try {
      // 1. Get company configuration
      const companyConfig = this.COMPANY_MAP[purchaseData.company];
      if (!companyConfig) {
        throw new Error(`Invalid electricity company: ${purchaseData.company}`);
      }

      console.log(`⚡ Company: ${companyConfig.name}`);

      // 2. Validate inputs
      this.validatePurchaseData(purchaseData, companyConfig);

      // 3. Verify meter number (optional - can be done before payment)
      await this.verifyMeterNumber(purchaseData.company, purchaseData.meterNumber);

      // 4. Check transaction hash uniqueness (only checks COMPLETED purchases)
      if (purchaseData.transactionHash) {
        await checkTransactionHashUniqueness(purchaseData.transactionHash);
      }

      let expectedCryptoAmount = 0;
      let receivingWallet = '';
      const isCryptoPayment = !!purchaseData.chain && !!purchaseData.transactionHash;

      if (isCryptoPayment) {
        // 5. Convert fiat to crypto
        expectedCryptoAmount = await convertFiatToCrypto(
          purchaseData.amount,
          purchaseData.chain!
        );

        // 6. Get receiving wallet
        receivingWallet = getBlockchainWallet(purchaseData.chain!);

        console.log(
          `💰 Expected: ${expectedCryptoAmount} ${purchaseData.chain} to ${receivingWallet}`
        );
      } else {
        console.log(`💵 Processing fiat electricity payment for ${purchaseData.amount} NGN`);
      }

      // 7. Create pending purchase record
      electricityPurchase = new ElectricityPurchase();
      electricityPurchase.user_id = userId;
      electricityPurchase.company = purchaseData.company;
      electricityPurchase.company_code = companyConfig.code;
      electricityPurchase.meter_type = purchaseData.meterType;
      electricityPurchase.meter_type_code =
        purchaseData.meterType === MeterType.PREPAID ? "01" : "02";
      electricityPurchase.meter_number = purchaseData.meterNumber;
      electricityPurchase.phone_number = purchaseData.phoneNumber;
      electricityPurchase.blockchain = purchaseData.chain || 'fiat';
      electricityPurchase.crypto_amount = expectedCryptoAmount;
      electricityPurchase.crypto_currency = purchaseData.chain?.toUpperCase() || 'NGN';
      electricityPurchase.fiat_amount = purchaseData.amount;
      electricityPurchase.transaction_hash = purchaseData.transactionHash || undefined;
      electricityPurchase.status = ElectricityPurchaseStatus.PROCESSING;

      await this.getRepository().save(electricityPurchase);

      if (isCryptoPayment) {
        // 8. Validate blockchain transaction
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
            electricityPurchase,
            "Transaction validation failed"
          );
          throw new Error(
            "Transaction validation failed. Please check the transaction details."
          );
        }

        console.log(`✅ Transaction validated! Proceeding to electricity payment...`);
      } else {
        console.log(`✅ Fiat payment accepted! Proceeding to electricity payment...`);
      }

      // 9. Process electricity payment with Nellobytes
      const providerResult = await this.processElectricityWithNellobytes(
        electricityPurchase
      );

      // 10. Mark as COMPLETED only if Nellobytes succeeded (transaction is now "used")
      electricityPurchase.status = ElectricityPurchaseStatus.COMPLETED;
      electricityPurchase.provider_reference = providerResult.orderid;
      electricityPurchase.meter_token = providerResult.metertoken;
      electricityPurchase.metadata = {
        providerResponse: providerResult,
        processedAt: new Date().toISOString(),
        companyDetails: {
          name: companyConfig.name,
          code: companyConfig.code,
        },
        security: {
          validatedAt: new Date().toISOString(),
          amountTolerance: SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT,
        },
      };
      await this.getRepository().save(electricityPurchase);

      // Mark transaction as used (for logging)
      markTransactionAsUsed(electricityPurchase.id, "electricity");

      console.log(
        `🎉 Electricity payment successful! Token: ${providerResult.metertoken}`
      );

      return {
        success: true,
        message: `Electricity payment successful! ₦${purchaseData.amount} paid to ${companyConfig.name}`,
        data: {
          purchaseId: electricityPurchase.id,
          amount: purchaseData.amount,
          company: companyConfig.name,
          meterNumber: purchaseData.meterNumber,
          meterType: purchaseData.meterType,
          meterToken: providerResult.metertoken,
          providerReference: providerResult.orderid,
          cryptoAmount: isCryptoPayment ? expectedCryptoAmount : undefined,
          cryptoCurrency: isCryptoPayment ? purchaseData.chain!.toUpperCase() : undefined,
          processedAt: new Date(),
        },
      };
    } catch (error: any) {
      console.error("❌ Electricity payment failed:", error);

      if (electricityPurchase && electricityPurchase.id) {
        await this.markPurchaseFailed(electricityPurchase, error.message);

        if (electricityPurchase.status === ElectricityPurchaseStatus.PROCESSING) {
          await initiateRefund(
            electricityPurchase,
            this.getRepository(),
            electricityPurchase.crypto_amount,
            electricityPurchase.crypto_currency,
            error.message,
            electricityPurchase.id
          );
        }
      }

      throw error;
    }
  }

  /**
   * Process electricity payment with Nellobytesystems
   */
  private async processElectricityWithNellobytes(
    purchase: ElectricityPurchase
  ) {
    try {
      console.log(
        `📞 Calling Nellobytes API for ₦${purchase.fiat_amount} electricity payment`
      );
      console.log(
        `   Company: ${purchase.company_code}, Meter: ${purchase.meter_number}`
      );

      const providerResult = await nellobytesService.purchaseElectricity(
        purchase.company_code,
        purchase.meter_type_code,
        purchase.meter_number,
        purchase.phone_number,
        purchase.fiat_amount
      );

      console.log(`📞 Nellobytes API response:`, providerResult);

      if (isSuccessfulResponse(providerResult)) {
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
      throw error;
    }
  }

  /**
   * Verify meter number before payment
   */
  async verifyMeterNumber(
    company: ElectricityCompany,
    meterNumber: string
  ): Promise<any> {
    try {
      const companyConfig = this.COMPANY_MAP[company];
      console.log(
        `🔍 Verifying meter number: ${meterNumber} for ${companyConfig.name}`
      );

      const result = await nellobytesService.verifyElectricityMeter(
        companyConfig.code,
        meterNumber
      );

      console.log("✅ Meter verification raw result:", result);

      const isValid = result.status === "00" || result.statuscode === "00";

      if (!isValid) {
        return {
          success: false,
          message: `Invalid meter number for ${companyConfig.name}`,
          data: {
            valid: false,
            meterNumber,
            company: companyConfig.name,
            details: result,
          },
        };
      }

      const customerName =
        result.customer_name || "Customer information not available";

      return {
        success: true,
        message: "Meter number verified successfully",
        data: {
          valid: true,
          meterNumber,
          company: companyConfig.name,
          customerName: customerName,
          details: result,
        },
      };
    } catch (error: any) {
      console.error(`❌ Meter verification failed:`, error.message);
      return {
        success: false,
        message: `Meter verification failed: ${error.message}`,
        data: null,
      };
    }
  }

  /**
   * Validate purchase data
   */
  private validatePurchaseData(
    purchaseData: any,
    companyConfig: ElectricityCompanyConfig
  ) {
    const {
      type,
      amount,
      chain,
      company,
      meterType,
      meterNumber,
      phoneNumber,
      transactionHash,
    } = purchaseData;

    // Type validation
    if (type !== "electricity") {
      throw new Error("Invalid purchase type");
    }

    // Company validation
    if (!Object.values(ElectricityCompany).includes(company)) {
      throw new Error(
        `Invalid electricity company. Supported: ${Object.values(
          ElectricityCompany
        ).join(", ")}`
      );
    }

    // Meter type validation
    if (!Object.values(MeterType).includes(meterType)) {
      throw new Error(
        `Invalid meter type. Supported: ${Object.values(MeterType).join(", ")}`
      );
    }

    // Meter number validation
    if (!meterNumber || typeof meterNumber !== "string") {
      throw new Error("Valid meter number is required");
    }

    if (meterNumber.length < 10 || meterNumber.length > 13) {
      throw new Error("Meter number must be between 10 and 13 digits");
    }

    // Common validation
    if (!chain && !transactionHash) {
      // Fiat payment validation
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new Error("Invalid phone number");
      }
      if (amount < companyConfig.minAmount || amount > companyConfig.maxAmount) {
        throw new Error(
          `Amount must be between ${companyConfig.minAmount} and ${companyConfig.maxAmount} NGN`
        );
      }
    } else {
      // Crypto payment validation
      validateCommonInputs({
        phoneNumber,
        chain,
        transactionHash,
        amount,
        minAmount: companyConfig.minAmount,
        maxAmount: companyConfig.maxAmount,
      });
    }

    console.log("✅ Input validation passed");
  }

  /**
   * Mark purchase as failed
   */
  private async markPurchaseFailed(
    purchase: ElectricityPurchase,
    reason: string
  ) {
    purchase.status = ElectricityPurchaseStatus.FAILED;
    purchase.metadata = {
      ...purchase.metadata,
      error: reason,
      failedAt: new Date().toISOString(),
    };
    await this.getRepository().save(purchase);

    logSecurityEvent("PURCHASE_FAILED", {
      purchaseId: purchase.id,
      reason,
      userId: purchase.user_id,
    });

    // Notify user about failure
    try {
      await NotificationService.notifyPurchaseFailed(
        purchase.user_id,
        NotificationType.UTILITY_PAYMENT,
        reason,
        { purchaseId: purchase.id }
      );
    } catch (err) {
      console.warn('Failed to send purchase failed notification:', err);
    }
  }

  // ========== PUBLIC UTILITY METHODS ==========

  async getUserElectricityHistory(userId: string, limit: number = 10) {
    return await this.getRepository().find({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      take: limit,
    });
  }

  async getExpectedCryptoAmount(amount: number, chain: Blockchain) {
    if (
      amount < SECURITY_CONSTANTS.MIN_ELECTRICITY_AMOUNT ||
      amount > SECURITY_CONSTANTS.MAX_ELECTRICITY_AMOUNT
    ) {
      throw new Error(
        `Amount must be between ₦${SECURITY_CONSTANTS.MIN_ELECTRICITY_AMOUNT} and ₦${SECURITY_CONSTANTS.MAX_ELECTRICITY_AMOUNT}`
      );
    }

    const cryptoAmount = await convertFiatToCrypto(amount, chain);

    return {
      cryptoAmount,
      cryptoCurrency: chain.toUpperCase(),
      fiatAmount: amount,
      chain,
      minAmount: SECURITY_CONSTANTS.MIN_ELECTRICITY_AMOUNT,
      maxAmount: SECURITY_CONSTANTS.MAX_ELECTRICITY_AMOUNT,
      tolerancePercent: SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT,
      instructions: `Send approximately ${cryptoAmount} ${chain.toUpperCase()} to complete the electricity payment`,
    };
  }

  getSupportedBlockchains() {
    return getSupportedBlockchains();
  }

  getSupportedCompanies() {
    return Object.entries(this.COMPANY_MAP).map(([key, config]) => ({
      value: key,
      label: config.name,
      code: config.code,
      minAmount: config.minAmount,
      maxAmount: config.maxAmount,
    }));
  }

  getSupportedMeterTypes() {
    return Object.values(MeterType).map((type) => ({
      value: type,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      code: type === MeterType.PREPAID ? "01" : "02",
    }));
  }

  getSecurityLimits() {
    return getSecurityLimits().electricity;
  }

  async getUserPurchaseStats(userId: string) {
    const history = await this.getUserElectricityHistory(userId, 1000);

    return {
      totalPurchases: history.length,
      totalSpent: history.reduce(
        (sum, purchase) => sum + parseFloat(purchase.fiat_amount.toString()),
        0
      ),
      successfulPurchases: history.filter(
        (p) => p.status === ElectricityPurchaseStatus.COMPLETED
      ).length,
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
}

export const electricityService = new ElectricityService();