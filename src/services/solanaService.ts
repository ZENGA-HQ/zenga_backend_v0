// solanaService.ts
// Service to fetch USDC balance for a Solana wallet using @solana/web3.js and @solana/spl-token

import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

const SOLANA_DEVNET = 'https://api.devnet.solana.com';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export async function getSolanaUsdcBalance(walletAddress: string): Promise<number> {
  const connection = new Connection(SOLANA_DEVNET);
  const owner = new PublicKey(walletAddress);
  const usdcMint = new PublicKey(USDC_MINT_DEVNET);
  const ata = await getAssociatedTokenAddress(usdcMint, owner);
  try {
    const account = await getAccount(connection, ata);
    // USDC has 6 decimals
    return Number(account.amount) / 1_000_000;
  } catch (e: any) {
    // If account not found, balance is 0
    if (e.message && e.message.includes('Failed to find account')) return 0;
    throw e;
  }
}
