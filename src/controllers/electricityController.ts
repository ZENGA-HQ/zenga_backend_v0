// src/controllers/electricityController.ts
import { Request, Response } from "express";
import { electricityService } from "../services/electricityService";
import { ElectricityCompany, MeterType, Blockchain } from "../entities/ElectricityPurchase";
import rateLimit from 'express-rate-limit';

export const electricityPurchaseRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 3, // Maximum 3 purchases per minute per IP
    message: {
        success: false,
        message: 'Too many purchase attempts. Please try again in a minute.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export class ElectricityController {
    /**
     * SECURE: Process electricity payment with rate limiting
     */
    async processElectricityPayment(req: Request, res: Response) {
        try {
            const { type, amount, chain, company, meterType, meterNumber, phoneNumber, transactionHash } = req.body;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // Validate required fields
            if (!amount || !company || !meterType || !meterNumber || !phoneNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: amount, company, meterType, meterNumber, phoneNumber'
                });
            }

            // If crypto payment, require chain and transactionHash
            if ((chain && !transactionHash) || (!chain && transactionHash)) {
                return res.status(400).json({
                    success: false,
                    message: 'Both chain and transactionHash are required for crypto payments'
                });
            }

            const result = await electricityService.processElectricityPayment(userId, {
                type: type || 'electricity',
                amount: parseFloat(amount),
                chain,
                company,
                meterType,
                meterNumber,
                phoneNumber,
                transactionHash
            });

            res.json(result);

        } catch (error: any) {
            console.error('Electricity payment error:', error);
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to process electricity payment'
            });
        }
    }

    /**
     * Verify meter number before payment
     */
    /**
  * Verify meter number before payment
  */
    async verifyMeterNumber(req: Request, res: Response) {
        try {
            // Accept both 'company' and 'disco' for compatibility
            const companyParam = (req.query.company || req.query.disco) as string;
            const { meterNumber } = req.query;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            if (!companyParam || !meterNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required parameters: company/disco, meterNumber'
                });
            }

            // Validate company
            if (!Object.values(ElectricityCompany).includes(companyParam as ElectricityCompany)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid company. Supported: ${Object.values(ElectricityCompany).join(', ')}`
                });
            }

            const result = await electricityService.verifyMeterNumber(
                companyParam as ElectricityCompany,
                meterNumber as string

            );
            const customerName = result.customer_name || "Customer information not available";

            // FIXED: Return the service result directly instead of wrapping it
            res.json(result);

        } catch (error: any) {
            console.error('Meter verification error:', error);
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to verify meter number'
            });
        }
    }

    /**
     * Get expected crypto amount for display
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

            const result = await electricityService.getExpectedCryptoAmount(
                fiatAmount,
                chain as Blockchain
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
     * Get user's electricity payment history
     */
    async getUserElectricityHistory(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            const limit = parseInt(req.query.limit as string) || 10;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const history = await electricityService.getUserElectricityHistory(userId, limit);

            res.json({
                success: true,
                message: "Electricity history retrieved successfully",
                data: history.map(purchase => ({
                    id: purchase.id,
                    company: purchase.company,
                    companyCode: purchase.company_code,
                    meterType: purchase.meter_type,
                    meterNumber: purchase.meter_number,
                    amount: purchase.fiat_amount,
                    phoneNumber: purchase.phone_number,
                    status: purchase.status,
                    blockchain: purchase.blockchain,
                    cryptoAmount: purchase.crypto_amount,
                    cryptoCurrency: purchase.crypto_currency,
                    transactionHash: purchase.transaction_hash,
                    providerReference: purchase.provider_reference,
                    meterToken: purchase.meter_token,
                    createdAt: purchase.created_at,
                    updatedAt: purchase.updated_at
                }))
            });
        } catch (error: any) {
            console.error("Electricity history retrieval error:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to retrieve electricity history",
            });
        }
    }

    /**
     * Get supported options (blockchains, companies, meter types)
     */
    async getSupportedOptions(req: Request, res: Response) {
        try {
            const blockchains = electricityService.getSupportedBlockchains();
            const companies = electricityService.getSupportedCompanies();
            const meterTypes = electricityService.getSupportedMeterTypes();

            res.json({
                success: true,
                message: "Supported options retrieved successfully",
                data: {
                    blockchains,
                    companies,
                    meterTypes,
                    currencies: ["NGN"],
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
     * Get specific electricity payment details
     */
    async getElectricityPayment(req: Request, res: Response) {
        try {
            const { purchaseId } = req.params;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const history = await electricityService.getUserElectricityHistory(userId, 100);
            const purchase = history.find((p) => p.id === purchaseId);

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: "Electricity payment not found",
                });
            }

            res.json({
                success: true,
                message: "Electricity payment retrieved successfully",
                data: {
                    id: purchase.id,
                    company: purchase.company,
                    companyCode: purchase.company_code,
                    meterType: purchase.meter_type,
                    meterTypeCode: purchase.meter_type_code,
                    meterNumber: purchase.meter_number,
                    amount: purchase.fiat_amount,
                    phoneNumber: purchase.phone_number,
                    status: purchase.status,
                    blockchain: purchase.blockchain,
                    cryptoAmount: purchase.crypto_amount,
                    cryptoCurrency: purchase.crypto_currency,
                    transactionHash: purchase.transaction_hash,
                    providerReference: purchase.provider_reference,
                    meterToken: purchase.meter_token,
                    metadata: purchase.metadata,
                    createdAt: purchase.created_at,
                    updatedAt: purchase.updated_at
                },
            });
        } catch (error: any) {
            console.error("Electricity payment retrieval error:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to retrieve electricity payment",
            });
        }
    }

    /**
     * Get user purchase statistics
     */
    async getUserPurchaseStats(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required",
                });
            }

            const stats = await electricityService.getUserPurchaseStats(userId);

            res.json({
                success: true,
                message: "Purchase statistics retrieved successfully",
                data: stats,
            });
        } catch (error: any) {
            console.error("Purchase stats retrieval error:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to retrieve purchase statistics",
            });
        }
    }

    /**
     * Get security limits
     */
    async getSecurityLimits(req: Request, res: Response) {
        try {
            const limits = electricityService.getSecurityLimits();

            res.json({
                success: true,
                message: "Security limits retrieved successfully",
                data: limits,
            });
        } catch (error: any) {
            console.error("Security limits retrieval error:", error);
            res.status(500).json({
                success: false,
                message: error.message || "Failed to retrieve security limits",
            });
        }
    }
}

export const electricityController = new ElectricityController();