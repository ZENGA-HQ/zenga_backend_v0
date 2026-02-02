// src/controllers/airtimeController.ts
import { Request, Response } from "express";
import { airtimeService } from "../services/airtimeService";
import { MobileNetwork, Blockchain } from "../entities/AirtimePurchase";
import rateLimit from 'express-rate-limit';

export const purchaseRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 3, // Maximum 3 purchases per minute per IP
    message: {
        success: false,
        message: 'Too many purchase attempts. Please try again in a minute.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export class AirtimeController {
    /**
     * SECURE: Process airtime purchase with rate limiting
     */
    async processAirtimePurchase(req: Request, res: Response) {
        try {
            const { type, amount, chain, phoneNumber, mobileNetwork, transactionHash } = req.body;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const result = await airtimeService.processAirtimePurchase(userId, {
                type,
                amount: parseFloat(amount),
                chain,
                phoneNumber,
                mobileNetwork,
                transactionHash
            });

            res.json(result);

        } catch (error: any) {
            console.error('Airtime purchase error:', error);
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to process airtime purchase'
            });
    }
  }

  /**
   * Get expected crypto amount for display (optional)
   */
  async getExpectedAmount(req: Request, res: Response) {
    try {
      const { amount, chain } = req.query;
      const fiatAmount = parseFloat(amount as string);

      if (!amount || !chain) {
        return res.status(400).json({
          success: false,
          message: "Missing amount or chain parameters",
        });
      }

      const result = await airtimeService.getExpectedCryptoAmount(
        fiatAmount,
        chain as any
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Get user's airtime purchase history
   */
  async getUserAirtimeHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      const history = await airtimeService.getUserAirtimeHistory(userId, limit);

      res.json({
        success: true,
        message: "Airtime history retrieved successfully",
        data: history,
      });
    } catch (error: any) {
      console.error("Airtime history retrieval error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve airtime history",
      });
    }
  }

  /**
   * Get supported blockchains and networks
   */
  async getSupportedOptions(req: Request, res: Response) {
    try {
      const blockchains = airtimeService.getSupportedBlockchains();

      res.json({
        success: true,
        message: "Supported options retrieved successfully",
        data: {
          blockchains,
          networks: Object.values(MobileNetwork),
          currencies: ["NGN"], // You can expand this later
        },
      });
    } catch (error: any) {
      console.error("Supported options retrieval error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve supported options",
      });
    }
  }

  /**
   * Get specific airtime purchase details
   */
  async getAirtimePurchase(req: Request, res: Response) {
    try {
      const { purchaseId } = req.params;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      // Since we don't have a direct method, we'll get from history and filter
      const history = await airtimeService.getUserAirtimeHistory(userId, 50);
      const purchase = history.find((p) => p.id === purchaseId);

      if (!purchase) {
        return res.status(404).json({
          success: false,
          message: "Airtime purchase not found",
        });
      }

      res.json({
        success: true,
        message: "Airtime purchase retrieved successfully",
        data: purchase,
      });
    } catch (error: any) {
      console.error("Airtime purchase retrieval error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve airtime purchase",
      });
    }
  }
}

export const airtimeController = new AirtimeController();