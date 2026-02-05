import crypto from "crypto";
import { Request, Response } from "express";
import { FiatTransaction } from "../entities/FiatTransaction";
import { paystackConfig } from "../services/paystack/config";
import { AppDataSource } from "../config/database";
import { User } from "../entities/User";
import initializeTransaction, {
  InitPaymentInput,
} from "../services/paystack/paystackService";
import calculateTotalCharge from "../services/paystack/feeService";
import dotenv from "dotenv";
import { log } from "console";
dotenv.config();

interface PaystackWebhookBody {
  event: string;
  data: {
    reference: string;
    amount: number;
    [key: string]: any;
  };
}

export class PaystackController {
  private userRepository = AppDataSource.getRepository(User);
  private transactionRepository = AppDataSource.getRepository(FiatTransaction);

  public fundWallet = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { amount, paymentDescription, crypto: cryptoCurrency } = req.body;

      if (!amount || typeof amount !== "number" || isNaN(amount)) {
        return res.status(400).json({ error: "Valid amount is required" });
      }

      if (amount < 1000) {
        return res.status(400).json({
          error: "Amount to be funded must be greater than 1000NGN",
        });
      }

      if (!cryptoCurrency || typeof cryptoCurrency !== "string") {
        return res.status(400).json({
          error: "Valid crypto currency is required",
        });
      }

      // Generate unique reference
      const randomId = crypto.randomBytes(4).toString("hex");
      const paymentRef = `ZENGA_REF_${Date.now()}_${randomId}`;

      const fees = calculateTotalCharge(Number(amount));

      // Validate crypto currency
      if (!cryptoCurrency || typeof cryptoCurrency !== "string") {
        return res.status(400).json({
          error: "Valid crypto currency is required",
        });
      }

      // build the response for the transaction
      const response = await initializeTransaction({
        amount: fees.totalToCharge,
        customerEmail: user.email,
        crypto: cryptoCurrency,
        paymentReference: paymentRef,
        paymentDescription: paymentDescription,
        redirectUrl: `${process.env.FRONTEND_DOMAIN}`,
      });

      // Save transaction in DB
      const transaction = this.transactionRepository.create({
        userId: user.id,
        amount: fees.userAmount,
        reference: paymentRef,
        crypto: cryptoCurrency,
        status: "pending",
        paymentDescription,
      });

      await this.transactionRepository.save(transaction);

      // Return response for frontend
      return res.status(200).json({
        message: "Transaction initialized. Please complete payment.",
        checkoutUrl: response.data.authorization_url,
        reference: paymentRef,
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ message: "Failed to fund wallet" });
    }
  };

  public verifyTransactionWithWebhook = async (
    req: Request<{}, {}, PaystackWebhookBody>,
    res: Response,
  ) => {
    try {
      const signature = req.headers["x-paystack-signature"] as string;
      const payload = JSON.stringify(req.body);

      if (!paystackConfig.secretKey) {
        throw new Error("PAYSTACK_SECRET_KEY is not set in environment");
      }

      const expectedSignature = crypto
        .createHmac("sha512", paystackConfig.secretKey)
        .update(payload)
        .digest("hex");

      if (signature !== expectedSignature) {
        return res.status(430).json({
          success: false,
          error: "Invalid signature",
        });
      }

      const { event, data } = req.body;

      if (event !== "charge.success") {
        return res.status(200).json({
          message: "Paystack Webhook acknowledged: Skipped processing",
        });
      }

      const reference = data.reference;
      const amountPaid = data.amount / 100; // convert kobo → Naira

      const transaction = await this.transactionRepository.findOne({
        where: { reference },
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: "Transaction not found",
        });
      }

      if (transaction.status === "success") {
        return res.status(200).json({
          message: "Transaction has been processed earlier",
        });
      }

      // Mark transaction as successful
      transaction.status = "success";
      await this.transactionRepository.save(transaction);

      return res.status(200).json({
        success: true,
        message: "Transaction verified successfully",
        reference,
        amountPaid,
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  };
}
