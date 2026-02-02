/**
 * VELO Fee Service
 * Implements the Normal Transaction Model
 * 
 * Fee Tiers:
 * - $0 - $10: $0.00 (no VELO fee)
 * - $10.01 - $50: $0.10
 * - $51 - $100: $0.25
 * - $101 - $500: $1.00
 * - $501 - $1,000: $2.00
 * - $1,001+: 0.5% (percentage-based)
 */

export interface FeeCalculation {
    amount: number;
    fee: number;
    total: number;
    tier: string;
    feePercentage: number;
    recipientReceives: number; // What recipient actually gets
    senderPays: number; // What sender actually pays (amount + fee)
}

export interface FeeTier {
    min: number;
    max: number | null;
    fee: number | null;
    percentage: number | null;
    description: string;
}

export class FeeService {
    // Fee tiers based on VELO business model
    private static readonly FEE_TIERS: FeeTier[] = [
        // Waive VELO fee for very small transactions: $0.00 - $10.00
        {
            min: 0,
            max: 10,
            fee: 0.00,
            percentage: null,
            description: 'No VELO fee for micro transactions up to $10'
        },
        {
            min: 10.01,
            max: 50,
            fee: 0.10,
            percentage: null,
            description: 'Low-volume micro transactions'
        },
        {
            min: 51,
            max: 100,
            fee: 0.25,
            percentage: null,
            description: 'Entry-level user range'
        },
        {
            min: 101,
            max: 500,
            fee: 1.00,
            percentage: null,
            description: 'Average retail user'
        },
        {
            min: 501,
            max: 1000,
            fee: 2.00,
            percentage: null,
            description: 'SME and merchant payments'
        },
        {
            min: 1001,
            max: null,
            fee: null,
            percentage: 0.5,
            description: 'Large or enterprise payments'
        }
    ];

    /**
     * Calculate transaction fee based on amount
     * @param amount - Transaction amount in USD or USD equivalent
     * @returns FeeCalculation object with fee details
     */
    static calculateFee(amount: number): FeeCalculation {
        if (amount < 0) {
            throw new Error('Transaction amount cannot be negative');
        }

        if (amount === 0) {
            return {
                amount: 0,
                fee: 0,
                total: 0,
                tier: '$0',
                feePercentage: 0,
                recipientReceives: 0,
                senderPays: 0
            };
        }

        // Find the appropriate tier
        const tier = this.FEE_TIERS.find(t => {
            if (t.max === null) {
                return amount >= t.min;
            }
            return amount >= t.min && amount <= t.max;
        });

        if (!tier) {
            throw new Error(`No fee tier found for amount: $${amount}`);
        }

        let fee: number;
        let tierLabel: string;

        if (tier.percentage !== null) {
            // Percentage-based fee for large transactions
            fee = Math.round((amount * tier.percentage / 100) * 100) / 100;
            tierLabel = `$${tier.min}+ (${tier.percentage}%)`;
        } else if (tier.fee !== null) {
            // Flat fee for smaller transactions
            fee = tier.fee;
            if (tier.max === null) {
                tierLabel = `$${tier.min}+`;
            } else {
                tierLabel = `$${tier.min}-$${tier.max}`;
            }
        } else {
            throw new Error('Invalid fee tier configuration');
        }

        const total = Math.round((amount + fee) * 100) / 100;
        const feePercentage = Math.round((fee / amount * 100) * 100) / 100;

        return {
            amount,
            fee,
            total,
            tier: tierLabel,
            feePercentage,
            recipientReceives: amount, // Recipient gets the full requested amount
            senderPays: total // Sender pays amount + fee
        };
    }

    /**
     * Calculate fee from total amount (reverse calculation)
     * Useful when user specifies total and we need to extract the fee
     * @param total - Total amount including fee
     * @returns FeeCalculation object
     */
    static calculateFeeFromTotal(total: number): FeeCalculation {
        if (total < 0) {
            throw new Error('Total amount cannot be negative');
        }

        if (total === 0) {
            return {
                amount: 0,
                fee: 0,
                total: 0,
                tier: '$0',
                feePercentage: 0,
                recipientReceives: 0,
                senderPays: 0
            };
        }

        // For percentage-based tier ($1,001+)
        // If total includes 0.5% fee: amount = total / 1.005
        if (total > 1003) { // rough threshold where 0.5% tier applies
            const amount = Math.round((total / 1.005) * 100) / 100;
            return this.calculateFee(amount);
        }

        // For flat fee tiers, iterate to find the right amount
        // This is a simplified approach - binary search could optimize
        for (let testAmount = total; testAmount >= 0; testAmount -= 0.01) {
            const calc = this.calculateFee(testAmount);
            if (Math.abs(calc.total - total) < 0.01) {
                return calc;
            }
        }

        // Fallback: assume total is close to amount + smallest fee
        const amount = total - 0.10;
        return this.calculateFee(amount);
    }

    /**
     * Get all fee tiers configuration
     * @returns Array of fee tiers
     */
    static getFeeTiers(): FeeTier[] {
        return this.FEE_TIERS;
    }

    /**
     * Get fee configuration as a simple object
     * Useful for frontend display
     */
    static getFeeConfig() {
        return {
            tiers: this.FEE_TIERS.map(tier => ({
                range: tier.max === null 
                    ? `$${tier.min}+` 
                    : `$${tier.min} - $${tier.max}`,
                fee: tier.fee !== null ? `$${tier.fee}` : `${tier.percentage}%`,
                description: tier.description
            })),
            model: 'Normal Transaction Model',
            version: '1.0',
            lastUpdated: 'October 2025'
        };
    }

    /**
     * Batch calculate fees for multiple transactions
     * @param amounts - Array of transaction amounts
     * @returns Array of fee calculations
     */
    static calculateBatchFees(amounts: number[]): FeeCalculation[] {
        return amounts.map(amount => this.calculateFee(amount));
    }

    /**
     * Calculate total fees for a batch of transactions
     * @param amounts - Array of transaction amounts
     * @returns Summary of total amounts and fees
     */
    static calculateBatchSummary(amounts: number[]) {
        const calculations = this.calculateBatchFees(amounts);
        
        const totalAmount = calculations.reduce((sum, calc) => sum + calc.amount, 0);
        const totalFee = calculations.reduce((sum, calc) => sum + calc.fee, 0);
        const totalPayable = calculations.reduce((sum, calc) => sum + calc.total, 0);

        return {
            transactions: calculations.length,
            totalAmount: Math.round(totalAmount * 100) / 100,
            totalFee: Math.round(totalFee * 100) / 100,
            totalPayable: Math.round(totalPayable * 100) / 100,
            averageFeePercentage: Math.round((totalFee / totalAmount * 100) * 100) / 100,
            breakdown: calculations
        };
    }

    /**
     * Validate if fee is correctly applied to amount
     * @param amount - Original amount
     * @param fee - Applied fee
     * @param tolerance - Acceptable difference (default 0.01)
     * @returns boolean indicating if fee is valid
     */
    static validateFee(amount: number, fee: number, tolerance: number = 0.01): boolean {
        const expectedCalc = this.calculateFee(amount);
        return Math.abs(expectedCalc.fee - fee) <= tolerance;
    }

    /**
     * Get minimum transaction amount (where fee doesn't exceed amount)
     * For VELO, minimum is $0.10 fee for $0-$50 range
     * @returns minimum transaction amount
     */
    static getMinimumTransactionAmount(): number {
        return 0.01; // Minimum practical amount (allow small micro payments); fee waived under $10
    }

    /**
     * Calculate net amount received by recipient (amount - fee)
     * Used when sender pays the fee
     * @param amount - Gross amount
     * @returns Net amount after fee deduction
     */
    static calculateNetAmount(amount: number): { net: number; fee: number } {
        const calc = this.calculateFee(amount);
        return {
            net: Math.round((amount - calc.fee) * 100) / 100,
            fee: calc.fee
        };
    }
}

export default FeeService;
