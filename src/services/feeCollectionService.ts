/**
 * Fee Collection Service
 * Handles sending collected fees to VELO treasury wallets
 */

import { AppDataSource } from '../config/database';
import { Fee } from '../entities/Fee';
import { Transaction } from '../entities/Transaction';
import TreasuryConfig from '../config/treasury';
import { FeeCalculation } from './feeService';

export interface FeeTransferResult {
    success: boolean;
    feeAmount: string;
    treasuryAddress: string;
    txHash?: string;
    error?: string;
}

export class FeeCollectionService {
    /**
     * Record fee in database
     * Called after successful transaction to log the fee
     */
    static async recordFee(params: {
        userId: string;
        transactionId?: string;
        calculation: FeeCalculation;
        chain: string;
        network: string;
        currency?: string;
        feeType?: string;
        description?: string;
    }): Promise<Fee> {
        const feeRepo = AppDataSource.getRepository(Fee);

        const feeRecord = feeRepo.create({
            userId: params.userId,
            transactionId: params.transactionId,
            amount: params.calculation.amount.toString(),
            fee: params.calculation.fee.toString(),
            total: params.calculation.total.toString(),
            tier: params.calculation.tier,
            feePercentage: params.calculation.feePercentage.toString(),
            feeType: params.feeType || 'normal_transaction',
            currency: params.currency || 'USD',
            chain: params.chain,
            network: params.network,
            description: params.description,
            metadata: {
                recipientReceives: params.calculation.recipientReceives,
                senderPays: params.calculation.senderPays
            }
        });

        await feeRepo.save(feeRecord);
        return feeRecord;
    }

    /**
     * Get treasury wallet for fee collection
     */
    static getTreasuryWallet(chain: string, network: string): string {
        return TreasuryConfig.getTreasuryWallet(chain, network);
    }

    /**
     * Validate if treasury is configured for a chain/network
     */
    static isTreasuryConfigured(chain: string, network: string): boolean {
        return TreasuryConfig.isTreasuryConfigured(chain, network);
    }

    /**
     * Calculate total fee deduction from sender
     * This is what needs to be deducted from sender's balance
     */
    static calculateTotalDeduction(amount: number, fee: number): number {
        return Math.round((amount + fee) * 100) / 100;
    }

    /**
     * Validate sender has sufficient balance for amount + fee
     */
    static validateSufficientBalance(
        senderBalance: number,
        amount: number,
        fee: number
    ): { valid: boolean; required: number; shortfall?: number } {
        const required = this.calculateTotalDeduction(amount, fee);
        const valid = senderBalance >= required;

        return {
            valid,
            required,
            shortfall: valid ? undefined : Math.round((required - senderBalance) * 100) / 100
        };
    }

    /**
     * Create fee transfer transaction record
     * This records the internal fee transfer to treasury
     */
    static async createFeeTransferRecord(params: {
        userId: string;
        feeAmount: string;
        chain: string;
        network: string;
        fromAddress: string;
        treasuryAddress: string;
        originalTxId?: string;
    }): Promise<Transaction> {
        const txRepo = AppDataSource.getRepository(Transaction);

        const feeTx = txRepo.create({
            userId: params.userId,
            type: 'fee_collection',
            amount: parseFloat(params.feeAmount),
            chain: params.chain,
            network: params.network,
            fromAddress: params.fromAddress,
            toAddress: params.treasuryAddress,
            txHash: '', // Will be updated when fee is actually transferred
            status: 'pending',
            details: {
                feeType: 'normal_transaction',
                originalTransactionId: params.originalTxId,
                isFeeCollection: true
            }
        });

        await txRepo.save(feeTx);
        return feeTx;
    }

    /**
     * Mark fee transfer as completed
     */
    static async completeFeeTransfer(
        feeTransactionId: string,
        txHash: string
    ): Promise<void> {
        const txRepo = AppDataSource.getRepository(Transaction);
        
        const feeTx = await txRepo.findOne({ where: { id: feeTransactionId } });
        if (feeTx) {
            feeTx.status = 'confirmed';
            feeTx.txHash = txHash;
            feeTx.details = {
                ...(feeTx.details || {}),
                completedAt: new Date().toISOString()
            };
            await txRepo.save(feeTx);
        }
    }

    /**
     * Mark fee transfer as failed
     */
    static async failFeeTransfer(
        feeTransactionId: string,
        error: string
    ): Promise<void> {
        const txRepo = AppDataSource.getRepository(Transaction);
        
        const feeTx = await txRepo.findOne({ where: { id: feeTransactionId } });
        if (feeTx) {
            feeTx.status = 'failed';
            feeTx.error = error;
            feeTx.details = {
                ...(feeTx.details || {}),
                failedAt: new Date().toISOString()
            };
            await txRepo.save(feeTx);
        }
    }

    /**
     * Get fee collection statistics
     */
    static async getFeeStats(params?: {
        startDate?: Date;
        endDate?: Date;
        chain?: string;
        network?: string;
    }) {
        const feeRepo = AppDataSource.getRepository(Fee);
        let query = feeRepo.createQueryBuilder('fee');

        if (params?.startDate) {
            query = query.andWhere('fee.createdAt >= :startDate', { startDate: params.startDate });
        }

        if (params?.endDate) {
            query = query.andWhere('fee.createdAt <= :endDate', { endDate: params.endDate });
        }

        if (params?.chain) {
            query = query.andWhere('fee.chain = :chain', { chain: params.chain });
        }

        if (params?.network) {
            query = query.andWhere('fee.network = :network', { network: params.network });
        }

        const fees = await query.getMany();

        const totalFees = fees.reduce((sum, fee) => sum + parseFloat(fee.fee), 0);
        const totalVolume = fees.reduce((sum, fee) => sum + parseFloat(fee.amount), 0);

        return {
            transactionCount: fees.length,
            totalFeesCollected: Math.round(totalFees * 100) / 100,
            totalVolume: Math.round(totalVolume * 100) / 100,
            averageFee: fees.length > 0 ? Math.round((totalFees / fees.length) * 100) / 100 : 0,
            effectiveRate: totalVolume > 0 ? Math.round((totalFees / totalVolume * 100) * 100) / 100 : 0
        };
    }
}

export default FeeCollectionService;
