/**
 * Migration Script: Add Company Codes to Existing Companies
 * 
 * This script ensures all existing companies have company codes.
 * Run this once to fix any companies created before the company code feature.
 * 
 * Usage:
 *   ts-node src/scripts/migrate-company-codes.ts
 * 
 * Or add to package.json scripts:
 *   "migrate:company-codes": "ts-node src/scripts/migrate-company-codes.ts"
 */

import { AppDataSource } from '../config/database';
import { Company } from '../entities/Company';
import { IsNull } from 'typeorm';
import { randomBytes } from 'crypto';

async function generateCompanyCode(): Promise<string> {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    const bytes = randomBytes(8);

    for (let i = 0; i < 8; i++) {
        code += chars[bytes[i] % chars.length];
    }

    return code;
}

async function migrateCompanyCodes() {
    try {
        console.log('[Migration] Starting company code migration...');

        // Initialize database connection
        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }

        const companyRepo = AppDataSource.getRepository(Company);

        // Find all companies without company codes
        const companiesWithoutCodes = await companyRepo.find({
            where: { companyCode: IsNull() }
        });

        console.log(`[Migration] Found ${companiesWithoutCodes.length} companies without codes`);

        if (companiesWithoutCodes.length === 0) {
            console.log('[Migration] ✅ All companies already have codes!');
            process.exit(0);
        }

        // Generate and save codes for each company
        let successCount = 0;
        let failCount = 0;

        for (const company of companiesWithoutCodes) {
            try {
                const code = await generateCompanyCode();
                company.companyCode = code;
                await companyRepo.save(company);

                console.log(`[Migration] ✅ Generated code for ${company.companyName}: ${code}`);
                successCount++;
            } catch (error) {
                console.error(`[Migration] ❌ Failed to generate code for ${company.companyName}:`, error);
                failCount++;
            }
        }

        console.log('\n[Migration] ========================================');
        console.log(`[Migration] Migration complete!`);
        console.log(`[Migration] Success: ${successCount}`);
        console.log(`[Migration] Failed: ${failCount}`);
        console.log('[Migration] ========================================\n');

        process.exit(failCount > 0 ? 1 : 0);

    } catch (error) {
        console.error('[Migration] Fatal error:', error);
        process.exit(1);
    }
}

// Run migration
migrateCompanyCodes();
