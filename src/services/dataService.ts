// src/services/dataService.ts - REFACTORED
import { Repository } from "typeorm";
import { AppDataSource } from "../config/database";
import { NotificationService } from "./notificationService";
import { NotificationType } from "../types";
import {
  DataPurchase,
  DataPurchaseStatus,
} from "../entities/DataPurchase";
import nellobytesService, {
  isSuccessfulResponse,
  parsePriceString,
  NellobytesDataPlan,
} from "./nellobytesService";
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

export class DataService {
  private dataPurchaseRepo: Repository<DataPurchase>;

  // Data plans cache
  private dataPlansCache: { [key in MobileNetwork]?: NellobytesDataPlan[] } = {};
  private plansCacheTimestamp: number = 0;
  private readonly CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

  constructor() {
    this.dataPurchaseRepo = null as any;
  }

  private getRepository(): Repository<DataPurchase> {
    if (!this.dataPurchaseRepo) {
      this.dataPurchaseRepo = AppDataSource.getRepository(DataPurchase);
    }
    return this.dataPurchaseRepo;
  }

  /**
   * Fetch and cache data plans from Nellobytes API
   */
  private async refreshDataPlans(): Promise<void> {
    const now = Date.now();

    if (
      this.plansCacheTimestamp &&
      now - this.plansCacheTimestamp < this.CACHE_DURATION_MS
    ) {
      console.log("📋 Using cached data plans");
      return;
    }

    try {
      console.log("📋 Fetching fresh data plans from Nellobytes API...");

      const allPlans = await nellobytesService.fetchDataPlans();

      this.dataPlansCache = {
        [MobileNetwork.MTN]: allPlans.filter((p) => p.plan_network === "01"),
        [MobileNetwork.GLO]: allPlans.filter((p) => p.plan_network === "02"),
        [MobileNetwork.ETISALAT]: allPlans.filter((p) => p.plan_network === "03"),
        [MobileNetwork.AIRTEL]: allPlans.filter((p) => p.plan_network === "04"),
      };

      this.plansCacheTimestamp = now;

      console.log("✅ Data plans cached successfully:", {
        mtn: this.dataPlansCache[MobileNetwork.MTN]?.length || 0,
        glo: this.dataPlansCache[MobileNetwork.GLO]?.length || 0,
        "9mobile": this.dataPlansCache[MobileNetwork.ETISALAT]?.length || 0,
        airtel: this.dataPlansCache[MobileNetwork.AIRTEL]?.length || 0,
      });
    } catch (error: any) {
      console.error("❌ Failed to fetch data plans:", error.message);

      if (Object.keys(this.dataPlansCache).length === 0) {
        throw new Error("Failed to load data plans. Please try again later.");
      }

      console.warn("⚠️ Using stale cache due to API error");
    }
  }

  /**
   * Process data purchase with comprehensive validation
   */
  async processDataPurchase(
    userId: string,
    purchaseData: {
      type: "data";
      dataplanId: string;
      amount: number;
      chain?: Blockchain;  // Optional for fiat
      phoneNumber: string;
      mobileNetwork: MobileNetwork;
      transactionHash?: string;  // Optional for fiat
    }
  ) {
    console.log(
      `📄 Processing data purchase for user ${userId}:`,
      purchaseData
    );

    let dataPurchase: DataPurchase | null = null;

    try {
      // 1. Refresh data plans cache
      await this.refreshDataPlans();

      // 2. Get and validate the selected data plan
      const plan = await this.getDataPlanById(
        purchaseData.mobileNetwork,
        purchaseData.dataplanId
      );
      if (!plan) {
        throw new Error(`Invalid data plan selected: ${purchaseData.dataplanId}`);
      }

      console.log(`📱 Selected plan: ${plan.plan_name} - ${plan.plan_amount}`);

      // 3. Parse the plan amount
      const planAmount = parsePriceString(plan.plan_amount);
      console.log(`💰 Plan price: ₦${planAmount}`);

      // 4. Validate that user's amount matches plan amount
      if (Math.abs(purchaseData.amount - planAmount) > 0.01) {
        throw new Error(
          `Amount mismatch: Expected ₦${planAmount} for selected plan, but received ₦${purchaseData.amount}`
        );
      }

      // 5. Validate inputs
      this.validatePurchaseData(purchaseData, planAmount);

      // 6. Check transaction hash uniqueness (only checks COMPLETED purchases)
      if (purchaseData.transactionHash) {
        await checkTransactionHashUniqueness(purchaseData.transactionHash);
      }

      let expectedCryptoAmount = 0;
      let receivingWallet = '';
      const isCryptoPayment = !!purchaseData.chain && !!purchaseData.transactionHash;

      if (isCryptoPayment) {
        // 7. Convert fiat to crypto
        expectedCryptoAmount = await convertFiatToCrypto(
          purchaseData.amount,
          purchaseData.chain!
        );

        // 8. Get receiving wallet
        receivingWallet = getBlockchainWallet(purchaseData.chain!);

        console.log(
          `💰 Expected: ${expectedCryptoAmount} ${purchaseData.chain} to ${receivingWallet}`
        );
      } else {
        console.log(`💵 Processing fiat data purchase for ${purchaseData.amount} NGN`);
      }

      // 9. Create pending purchase record
      dataPurchase = new DataPurchase();
      dataPurchase.user_id = userId;
      dataPurchase.network = purchaseData.mobileNetwork;
      dataPurchase.blockchain = purchaseData.chain || 'fiat';
      dataPurchase.crypto_amount = expectedCryptoAmount;
      dataPurchase.crypto_currency = purchaseData.chain?.toUpperCase() || 'NGN';
      dataPurchase.fiat_amount = purchaseData.amount;
      dataPurchase.phone_number = purchaseData.phoneNumber;
      dataPurchase.transaction_hash = purchaseData.transactionHash || undefined;
      dataPurchase.status = DataPurchaseStatus.PROCESSING;
      dataPurchase.plan_name = plan.plan_name;
      dataPurchase.dataplan_id = plan.dataplan_id;

      await this.getRepository().save(dataPurchase);

      if (isCryptoPayment) {
        // 10. Validate blockchain transaction
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
            dataPurchase,
            "Transaction validation failed"
          );
          throw new Error(
            "Transaction validation failed. Please check the transaction details."
          );
        }

        console.log(`✅ Transaction validated! Proceeding to data delivery...`);
      } else {
        console.log(`✅ Fiat payment accepted! Proceeding to data delivery...`);
      }

      // 11. Process data with Nellobytes
      const providerResult = await this.processDataWithNellobytes(dataPurchase);

      // 12. Mark as COMPLETED only if Nellobytes succeeded (transaction is now "used")
      dataPurchase.status = DataPurchaseStatus.COMPLETED;
      dataPurchase.provider_reference = providerResult.orderid;
      dataPurchase.metadata = {
        providerResponse: providerResult,
        processedAt: new Date().toISOString(),
        planDetails: {
          name: plan.plan_name,
          amount: plan.plan_amount,
          validity: plan.month_validate,
        },
        security: {
          validatedAt: new Date().toISOString(),
          amountTolerance: SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT,
        },
      };
      await this.getRepository().save(dataPurchase);

      // Mark transaction as used (for logging)
      markTransactionAsUsed(dataPurchase.id, "data");

      console.log(
        `🎉 Data delivered! ${plan.plan_name} to ${purchaseData.phoneNumber}`
      );

      return {
        success: true,
        message: `Data purchase successful! ${plan.plan_name} delivered to ${purchaseData.phoneNumber}`,
        data: {
          purchaseId: dataPurchase.id,
          planName: plan.plan_name,
          planAmount: plan.plan_amount,
          validity: plan.month_validate,
          network: purchaseData.mobileNetwork,
          phoneNumber: purchaseData.phoneNumber,
          providerReference: providerResult.orderid,
          cryptoAmount: isCryptoPayment ? expectedCryptoAmount : undefined,
          cryptoCurrency: isCryptoPayment ? purchaseData.chain!.toUpperCase() : undefined,
          deliveredAt: new Date(),
        },
      };
    } catch (error: any) {
      console.error("❌ Data purchase failed:", error);

      if (dataPurchase && dataPurchase.id) {
        await this.markPurchaseFailed(dataPurchase, error.message);

        if (dataPurchase.status === DataPurchaseStatus.PROCESSING) {
          await initiateRefund(
            dataPurchase,
            this.getRepository(),
            dataPurchase.crypto_amount,
            dataPurchase.crypto_currency,
            error.message,
            dataPurchase.id
          );
        }
      }

      throw error;
    }
  }

  /**
   * Process data with Nellobytesystems
   */
  private async processDataWithNellobytes(purchase: DataPurchase) {
    try {
      console.log(
        `📞 Calling Nellobytes API for ${purchase.plan_name} to ${purchase.phone_number}`
      );

      const providerResult = await nellobytesService.purchaseDataBundle(
        purchase.network,
        purchase.dataplan_id,
        purchase.phone_number,
        `VELO_DATA_${purchase.id}_${Date.now()}`
      );

      console.log(`📞 Nellobytes API response:`, providerResult);

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
   * Get data plan by ID
   */
  private async getDataPlanById(
    network: MobileNetwork,
    dataplanId: string
  ): Promise<NellobytesDataPlan | null> {
    await this.refreshDataPlans();

    const plans = this.dataPlansCache[network];
    if (!plans) return null;

    return plans.find((plan) => plan.dataplan_id === dataplanId) || null;
  }

  /**
   * Validate purchase data
   */
  private validatePurchaseData(purchaseData: any, planAmount: number) {
    const { type, amount, chain, phoneNumber, mobileNetwork, transactionHash } =
      purchaseData;

    // Type validation
    if (type !== "data") {
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

    // Common validation
    if (!chain && !transactionHash) {
      // Fiat payment validation
      if (!phoneNumber || phoneNumber.length < 10) {
        throw new Error("Invalid phone number");
      }
      if (amount < SECURITY_CONSTANTS.MIN_DATA_AMOUNT || amount > SECURITY_CONSTANTS.MAX_DATA_AMOUNT) {
        throw new Error(
          `Amount must be between ${SECURITY_CONSTANTS.MIN_DATA_AMOUNT} and ${SECURITY_CONSTANTS.MAX_DATA_AMOUNT} NGN`
        );
      }
    } else {
      // Crypto payment validation
      validateCommonInputs({
        phoneNumber,
        chain,
        transactionHash,
        amount,
        minAmount: SECURITY_CONSTANTS.MIN_DATA_AMOUNT,
        maxAmount: SECURITY_CONSTANTS.MAX_DATA_AMOUNT,
      });
    }

    console.log("✅ Input validation passed");
  }

  /**
   * Mark purchase as failed
   */
  private async markPurchaseFailed(purchase: DataPurchase, reason: string) {
    purchase.status = DataPurchaseStatus.FAILED;
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
        NotificationType.DATA_PURCHASE,
        reason,
        { purchaseId: purchase.id }
      );
    } catch (err) {
      console.warn('Failed to send purchase failed notification:', err);
    }
  }

  // ========== PUBLIC UTILITY METHODS ==========

  async getDataPlans(network: MobileNetwork): Promise<NellobytesDataPlan[]> {
    await this.refreshDataPlans();
    return this.dataPlansCache[network] || [];
  }

  async forceRefreshDataPlans(): Promise<void> {
    this.plansCacheTimestamp = 0;
    await this.refreshDataPlans();
  }

  async getUserDataHistory(userId: string, limit: number = 10) {
    return await this.getRepository().find({
      where: { user_id: userId },
      order: { created_at: "DESC" },
      take: limit,
    });
  }

  async getExpectedCryptoAmount(
    dataplanId: string,
    network: MobileNetwork,
    chain: Blockchain
  ) {
    const plan = await this.getDataPlanById(network, dataplanId);

    if (!plan) {
      throw new Error("Invalid data plan selected");
    }

    const planAmount = parsePriceString(plan.plan_amount);
    const cryptoAmount = await convertFiatToCrypto(planAmount, chain);

    return {
      cryptoAmount,
      cryptoCurrency: chain.toUpperCase(),
      fiatAmount: planAmount,
      chain,
      planDetails: {
        id: plan.dataplan_id,
        name: plan.plan_name,
        amount: plan.plan_amount,
        validity: plan.month_validate,
      },
      tolerancePercent: SECURITY_CONSTANTS.AMOUNT_TOLERANCE_PERCENT,
      instructions: `Send approximately ${cryptoAmount} ${chain.toUpperCase()} to complete the data purchase`,
    };
  }

  getSupportedBlockchains() {
    return getSupportedBlockchains();
  }

  getSupportedNetworks() {
    return getSupportedNetworks();
  }

  getSecurityLimits() {
    return getSecurityLimits().data;
  }

  async getUserPurchaseStats(userId: string) {
    const history = await this.getUserDataHistory(userId, 1000);

    return {
      totalPurchases: history.length,
      totalSpent: history.reduce(
        (sum, purchase) => sum + parseFloat(purchase.fiat_amount.toString()),
        0
      ),
      successfulPurchases: history.filter(
        (p) => p.status === DataPurchaseStatus.COMPLETED
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

export const dataService = new DataService();