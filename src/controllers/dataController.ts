// src/controllers/dataController.ts
import { Request, Response } from "express";
import { dataService } from "../services/dataService";
import { MobileNetwork, Blockchain } from "../entities/DataPurchase";
import rateLimit from 'express-rate-limit';

export const dataPurchaseRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 3, // Maximum 3 purchases per minute per IP
    message: {
        success: false,
        message: 'Too many purchase attempts. Please try again in a minute.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export class DataController {
    /**
     * SECURE: Process data purchase with rate limiting
     * Payload includes amount for blockchain validation
     */
    async processDataPurchase(req: Request, res: Response) {
        try {
            // Accept both 'planId' and 'dataplanId' for compatibility
            const dataplanIdParam = req.body.dataplanId || req.body.planId;
            const { type, amount, chain, phoneNumber, mobileNetwork, transactionHash } = req.body;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // Validate required fields
            // Validate required fields
            if (!dataplanIdParam || !amount || !phoneNumber || !mobileNetwork) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: planId, amount, phoneNumber, mobileNetwork'
                });
            }

            // If crypto payment, require chain and transactionHash
            if ((chain && !transactionHash) || (!chain && transactionHash)) {
                return res.status(400).json({
                    success: false,
                    message: 'Both chain and transactionHash are required for crypto payments'
                });
            }

            const result = await dataService.processDataPurchase(userId, {
                type: type || 'data',
                dataplanId: dataplanIdParam,
                amount: parseFloat(amount),
                chain,
                phoneNumber,
                mobileNetwork,
                transactionHash
            });

            res.json(result);

        } catch (error: any) {
            console.error('Data purchase error:', error);
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to process data purchase'
            });
        }
    }

    /**
     * Get available data plans for a network
     */
    async getDataPlans(req: Request, res: Response) {
        try {
            // Accept both 'network' and 'mobileNetwork' for compatibility
            const networkParam = (req.query.network || req.query.mobileNetwork) as string;
            const { refresh } = req.query;

            if (!networkParam) {
                return res.status(400).json({
                    success: false,
                    message: 'Network parameter is required (use network or mobileNetwork)'
                });
            }

            // Validate network
            if (!Object.values(MobileNetwork).includes(networkParam as MobileNetwork)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid network. Supported: ${Object.values(MobileNetwork).join(', ')}`
                });
            }

            // Force refresh if requested
            if (refresh === 'true') {
                await dataService.forceRefreshDataPlans();
            }

            const plans = await dataService.getDataPlans(networkParam as MobileNetwork);

            res.json({
                success: true,
                message: 'Data plans retrieved successfully',
                data: {
                    network: networkParam,
                    totalPlans: plans.length,
                    plans: plans.map(plan => ({
                        planId: plan.dataplan_id,  // Frontend expects 'planId'
                        dataplanId: plan.dataplan_id,  // Keep for backward compatibility
                        name: plan.plan_name,
                        amount: plan.plan_amount,
                        validity: plan.month_validate,
                        duration: plan.month_validate,  // Frontend expects 'duration'
                        description: plan.plan_name,  // Add description field
                        networkCode: plan.plan_network
                    }))
                }
            });

        } catch (error: any) {
            console.error('Get data plans error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve data plans'
            });
        }
    }

    /**
     * Get expected crypto amount for a data plan
     */
    async getExpectedAmount(req: Request, res: Response) {
        try {
            const { dataplanId, network, chain } = req.query;

            if (!dataplanId || !network || !chain) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required parameters: dataplanId, network, chain'
                });
            }

            const result = await dataService.getExpectedCryptoAmount(
                dataplanId as string,
                network as MobileNetwork,
                chain as Blockchain
            );

            res.json({
                success: true,
                data: result
            });

        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }

    /**
     * Get user's data purchase history
     */
    async getUserDataHistory(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
            const limit = parseInt(req.query.limit as string) || 10;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const history = await dataService.getUserDataHistory(userId, limit);

            res.json({
                success: true,
                message: 'Data purchase history retrieved successfully',
                data: history.map(purchase => ({
                    id: purchase.id,
                    network: purchase.network,
                    planName: purchase.plan_name,
                    dataplanId: purchase.dataplan_id,
                    amount: purchase.fiat_amount,
                    phoneNumber: purchase.phone_number,
                    status: purchase.status,
                    blockchain: purchase.blockchain,
                    cryptoAmount: purchase.crypto_amount,
                    cryptoCurrency: purchase.crypto_currency,
                    transactionHash: purchase.transaction_hash,
                    providerReference: purchase.provider_reference,
                    createdAt: purchase.created_at,
                    updatedAt: purchase.updated_at
                }))
            });

        } catch (error: any) {
            console.error('Data history retrieval error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve data purchase history'
            });
        }
    }

    /**
     * Get supported options (blockchains, networks)
     */
    async getSupportedOptions(req: Request, res: Response) {
        try {
            const blockchains = dataService.getSupportedBlockchains();
            const networks = dataService.getSupportedNetworks();

            res.json({
                success: true,
                message: 'Supported options retrieved successfully',
                data: {
                    blockchains,
                    networks,
                    currencies: ['NGN']
                }
            });

        } catch (error: any) {
            console.error('Supported options retrieval error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve supported options'
            });
        }
    }

    /**
     * Get specific data purchase details
     */
    async getDataPurchase(req: Request, res: Response) {
        try {
            const { purchaseId } = req.params;
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const history = await dataService.getUserDataHistory(userId, 100);
            const purchase = history.find(p => p.id === purchaseId);

            if (!purchase) {
                return res.status(404).json({
                    success: false,
                    message: 'Data purchase not found'
                });
            }

            res.json({
                success: true,
                message: 'Data purchase retrieved successfully',
                data: {
                    id: purchase.id,
                    network: purchase.network,
                    planName: purchase.plan_name,
                    dataplanId: purchase.dataplan_id,
                    amount: purchase.fiat_amount,
                    phoneNumber: purchase.phone_number,
                    status: purchase.status,
                    blockchain: purchase.blockchain,
                    cryptoAmount: purchase.crypto_amount,
                    cryptoCurrency: purchase.crypto_currency,
                    transactionHash: purchase.transaction_hash,
                    providerReference: purchase.provider_reference,
                    metadata: purchase.metadata,
                    createdAt: purchase.created_at,
                    updatedAt: purchase.updated_at
                }
            });

        } catch (error: any) {
            console.error('Data purchase retrieval error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve data purchase'
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
                    message: 'Authentication required'
                });
            }

            const stats = await dataService.getUserPurchaseStats(userId);

            res.json({
                success: true,
                message: 'Purchase statistics retrieved successfully',
                data: stats
            });

        } catch (error: any) {
            console.error('Purchase stats retrieval error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve purchase statistics'
            });
        }
    }

    /**
     * Get security limits
     */
    async getSecurityLimits(req: Request, res: Response) {
        try {
            const limits = dataService.getSecurityLimits();

            res.json({
                success: true,
                message: 'Security limits retrieved successfully',
                data: limits
            });

        } catch (error: any) {
            console.error('Security limits retrieval error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve security limits'
            });
        }
    }

    /**
     * Refresh data plans cache
     */
    async refreshDataPlans(req: Request, res: Response) {
        try {
            await dataService.forceRefreshDataPlans();

            res.json({
                success: true,
                message: 'Data plans refreshed successfully'
            });

        } catch (error: any) {
            console.error('Data plans refresh error:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to refresh data plans'
            });
        }
    }
}

export const dataController = new DataController();