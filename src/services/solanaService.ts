// solanaService.ts
// Service to fetch USDC balance for a Solana wallet using @solana/web3.js and @solana/spl-token

import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';

const SOLANA_DEVNET = 'https://api.devnet.solana.com';
const SOLANA_MAINNET = `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}` || 'https://api.mainnet-beta.solana.com';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export async function getSolanaUsdcBalance(walletAddress: string, network: 'testnet' | 'mainnet' = 'testnet'): Promise<number> {
  const rpc = network === 'testnet' ? SOLANA_DEVNET : SOLANA_MAINNET;
  const connection = new Connection(rpc);
  const owner = new PublicKey(walletAddress);
  const usdcMint = new PublicKey(network === 'testnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET);

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
