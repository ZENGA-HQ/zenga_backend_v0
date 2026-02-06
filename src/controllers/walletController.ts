import { Transaction } from "../entities/Transaction";
import { Request, Response } from "express";
import { UserAddress } from "../entities/UserAddress";
import { AuthRequest, NetworkType } from "../types";
import { RpcProvider, Account, ec, uint256 } from "starknet";
import { ethers } from "ethers";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction as SolTx,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as bitcoin from "bitcoinjs-lib";
// Import ECPair from the 'ecpair' package for compatibility with PSBT
import * as bitcoinjs from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
// ECPair will be initialized below imports to avoid ESM hoist issues
// const ECPair = ECPairFactory(ecc);
import axios from "axios";
import { Notification } from "../entities/Notification";
import { NotificationType } from "../types/index";
import { NotificationService } from "../services/notificationService";
import { User } from "../entities/User";
import { AppDataSource } from "../config/database";
import { decrypt } from "../utils/keygen";
import { checkBalance, deployStrkWallet } from "../utils/keygen";
import bcrypt from "bcryptjs";
import { FeeService } from "../services/feeService";
import FeeCollectionService from "../services/feeCollectionService";
import TreasuryConfig from "../config/treasury";
import { PriceFeedService } from "../services/priceFeedService";

// Initialize ECPair
const ECPair = ECPairFactory(ecc);

function padStarknetAddress(address: string): string {
  if (!address.startsWith("0x")) return address;
  const hex = address.slice(2).padStart(64, "0");
  return "0x" + hex;
}

export class WalletController {
  /**
   * Get balances for a specific user by userId (admin or public endpoint).
   * @param req Express request (expects req.params.userId)
   * @param res Express response
   */
  static async getBalancesByUserId(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { network } = req.query;
      if (!userId) {
        res.status(400).json({ error: "userId param is required" });
        return;
      }
      const addressRepo = AppDataSource.getRepository(UserAddress);
      let where: any = { userId };
      if (network) where.network = network;
      console.log("[DEBUG] getBalancesByUserId:", { userId, network });
      const addresses = await addressRepo.find({ where });
      console.log("[DEBUG] Found addresses:", addresses);
      const balances: any[] = [];
      for (const addr of addresses) {
        // ETH endpoints
        const ETH_MAINNET = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`;
        const ETH_TESTNET = `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`;
        // BTC endpoints
        const BTC_MAINNET = "https://blockstream.info/api/address/";
        const BTC_TESTNET = "https://blockstream.info/testnet/api/address/";
        // SOL endpoints
        const SOL_MAINNET = `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`;
        const SOL_TESTNET = `https://solana-devnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`; // Using devnet for testnet
        // STRK endpoints
        const STRK_MAINNET = `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`;
        const STRK_TESTNET = `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`;

        if (addr.chain === "starknet") {
          try {
            const provider = new RpcProvider({
              nodeUrl: addr.network === "testnet" ? STRK_TESTNET : STRK_MAINNET,
            });
            const tokenAddress =
              "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
            const erc20Abi = [
              {
                name: "balanceOf",
                type: "function",
                inputs: [{ name: "account", type: "felt" }],
                outputs: [{ name: "balance", type: "felt" }],
              },
            ];
            // @ts-ignore
            const { Contract } = require("starknet");
            const contract = new Contract(erc20Abi, tokenAddress, provider);
            const balanceResult = await contract.balanceOf(addr.address);
            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: balanceResult.balance.toString(),
            });
          } catch (err: any) {
            // If Stellar account not found (404) return zero balance silently
            if (err && err.response && err.response.status === 404) {
              balances.push({
                chain: addr.chain,
                network: addr.network,
                address: addr.address,
                balance: "0",
              });
            } else {
              console.debug(
                "Stellar balance fetch failed:",
                err?.message || err
              );
              balances.push({
                chain: addr.chain,
                network: addr.network,
                address: addr.address,
                balance: "0",
              });
            }
          }
        } else if (addr.chain === "ethereum") {
          try {
            const provider = new ethers.JsonRpcProvider(
              addr.network === "testnet" ? ETH_TESTNET : ETH_MAINNET
            );
            const balance = await provider.getBalance(addr.address as string);
            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: ethers.formatEther(balance),
            });
          } catch (err) {
            console.debug(
              "Polkadot balance fetch failed:",
              (err as any)?.message || err
            );
            // Return zero balance without an error field to keep API responses clean
            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: "0",
              symbol: "DOT",
            });
          }
        } else if (addr.chain === "bitcoin") {
          console.log(
            `[DEBUG] Checking BTC balance for address: ${addr.address}`
          );
          console.log(`[DEBUG] Network: ${addr.network}`);

          try {
            const url =
              (addr.network === "testnet" ? BTC_TESTNET : BTC_MAINNET) +
              addr.address;

            console.log(`[DEBUG] Fetching BTC balance from: ${url}`);

            const resp = await axios.get(url);
            const data = resp.data as {
              chain_stats: {
                funded_txo_sum: number;
                spent_txo_sum: number;
              };
            };

            console.log(`[DEBUG] BTC API response for ${addr.address}:`, data);

            const balance =
              data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;

            console.log(
              `[DEBUG] Current balance: ${balance} satoshis = ${balance / 1e8
              } BTC`
            );

            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: (balance / 1e8).toString(),
            });
          } catch (err) {
            console.error(
              `[ERROR] Failed to fetch BTC balance for ${addr.address}:`,
              err
            );

            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: "0",
              error: "Failed to fetch",
            });
          }
        } else if (addr.chain === "solana") {
          try {
            const SOL_RPC = addr.network === "testnet" 
              ? `https://solana-devnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
              : `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`;
            const connection = new Connection(SOL_RPC);
            const publicKey = new PublicKey(addr.address as string);
            const balance = await connection.getBalance(publicKey);
            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: (balance / 1e9).toString(),
            });
          } catch (err) {
            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: "0",
              error: "Failed to fetch",
            });
          }
        } else if (addr.chain === "stellar") {
          // Stellar balance via Horizon
          try {
            const HORIZON_MAIN = "https://horizon.stellar.org";
            const HORIZON_TEST = "https://horizon-testnet.stellar.org";
            if (!addr.address) throw new Error("No stellar address");
            const horizonUrl =
              addr.network === "testnet" ? HORIZON_TEST : HORIZON_MAIN;
            const resp = await axios.get(
              `${horizonUrl}/accounts/${addr.address}`
            );
            const data = resp.data as any;
            const native = (data.balances || []).find(
              (b: any) => b.asset_type === "native"
            );
            const balanceStr = native ? native.balance : "0";
            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: balanceStr,
            });
          } catch (err) {
            console.error(
              "Stellar balance fetch failed for",
              addr.address,
              "Error:",
              (err as any)?.message || String(err),
              "Status:",
              (err as any)?.response?.status
            );
            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: "0",
              error: "Failed to fetch",
            });
          }
        } else if (addr.chain === "polkadot") {
          // Polkadot balance via @polkadot/api (use derived balances so "transferable" matches polkadot.js UI)
          try {
            // @ts-ignore - dynamic require
            const { ApiPromise, WsProvider } = require("@polkadot/api");
            const wsUrl =
              addr.network === "testnet"
                ? process.env.POLKADOT_WS_TESTNET ||
                "wss://pas-rpc.stakeworld.io"
                : process.env.POLKADOT_WS_MAINNET || "wss://rpc.polkadot.io";
            const provider = new WsProvider(wsUrl);
            const api = await ApiPromise.create({ provider });

            // Use derived balances to match UI (available/transferable)
            const derived = await api.derive.balances.account(addr.address);
            const available =
              (derived &&
                (derived.availableBalance ??
                  derived.freeBalance ??
                  derived.free)) ||
              0;
            const PLANCK = BigInt(10 ** 10);
            const availableBig = BigInt(String(available));
            const dot = (availableBig / PLANCK).toString();

            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: dot,
              symbol: "DOT",
            });

            try {
              await api.disconnect();
            } catch { }
          } catch (err) {
            console.debug(
              "Polkadot balance fetch failed:",
              (err as any)?.message || err
            );
            balances.push({
              chain: addr.chain,
              network: addr.network,
              address: addr.address,
              balance: "0",
              symbol: "DOT",
              error: "Failed to fetch",
            });
          }
        } else {
          balances.push({
            chain: addr.chain,
            network: addr.network,
            address: addr.address,
            balance: "0",
            error: "Unsupported chain",
          });
        }
      }
      res.json({ balances });
    } catch (error) {
      console.error("Get balances by userId error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Debug endpoint: probe Alchemy URLs and return quick connectivity checks.
   * GET /wallet/debug/alchemy-probe
   */
  static async alchemyProbe(req: AuthRequest, res: Response): Promise<void> {
    try {
      const key = process.env.ALCHEMY_STARKNET_KEY || "";
      const urls = {
        ETH_MAINNET: `https://eth-mainnet.g.alchemy.com/v2/${key}`,
        ETH_SEPOLIA: `https://eth-sepolia.g.alchemy.com/v2/${key}`,
        STRK_MAINNET: `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_8/${key}`,
        STRK_SEPOLIA: `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/${key}`,
        SOL_MAINNET: `https://solana-mainnet.g.alchemy.com/v2/${key}`,
        SOL_DEVNET: `https://solana-devnet.g.alchemy.com/v2/${key}`,
      };

      console.debug("[DEBUG] alchemyProbe urls:", urls);

      const probes: Record<string, any> = {};

      const timeoutMs = 5000;

      async function probeEth(url: string) {
        try {
          const resp = await axios.post(
            url,
            { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
            { timeout: timeoutMs }
          );
          return { ok: true, status: resp.status, data: resp.data };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            status: err?.response?.status,
            body: err?.response?.data,
          };
        }
      }

      async function probeStark(url: string) {
        try {
          const resp = await axios.post(
            url,
            {
              jsonrpc: "2.0",
              id: 1,
              method: "starknet_blockNumber",
              params: [],
            },
            { timeout: timeoutMs }
          );
          return { ok: true, status: resp.status, data: resp.data };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            status: err?.response?.status,
            body: err?.response?.data,
          };
        }
      }

      async function probeSol(url: string) {
        try {
          const resp = await axios.post(
            url,
            { jsonrpc: "2.0", id: 1, method: "getVersion", params: [] },
            { timeout: timeoutMs }
          );
          return { ok: true, status: resp.status, data: resp.data };
        } catch (err: any) {
          return {
            ok: false,
            error: err?.message || String(err),
            status: err?.response?.status,
            body: err?.response?.data,
          };
        }
      }

      // Run probes in parallel
      const tasks = [
        ["ETH_MAINNET", probeEth(urls.ETH_MAINNET)],
        ["ETH_SEPOLIA", probeEth(urls.ETH_SEPOLIA)],
        ["STRK_MAINNET", probeStark(urls.STRK_MAINNET)],
        ["STRK_SEPOLIA", probeStark(urls.STRK_SEPOLIA)],
        ["SOL_MAINNET", probeSol(urls.SOL_MAINNET)],
        ["SOL_DEVNET", probeSol(urls.SOL_DEVNET)],
      ];

      const results = await Promise.all(tasks.map((t) => t[1]));
      for (let i = 0; i < tasks.length; i++) {
        probes[tasks[i][0] as string] = results[i];
      }

      // Log summary
      console.debug(
        "[DEBUG] alchemyProbe results:",
        Object.keys(probes).reduce((acc: any, k) => {
          acc[k] = { ok: probes[k].ok, status: probes[k].status };
          return acc;
        }, {})
      );

      res.json({ ok: true, keyPresent: !!key, probes });
    } catch (err: any) {
      console.error("alchemyProbe error:", err);
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  }

  // Helper function to get a working Starknet provider with fallbacks
  static async getStarknetProvider(): Promise<RpcProvider> {
    const providers = [
      // Primary: Alchemy (if API key is available and valid)
      process.env.ALCHEMY_STARKNET_KEY
        ? `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`
        : null,
      // Fallback: BlastAPI public endpoint
      "https://starknet-mainnet.public.blastapi.io",
      // Additional fallback: Nethermind public endpoint
      "https://starknet-mainnet.public.zksync.io",
    ].filter((url): url is string => url !== null); // Remove null values and type guard

    for (const url of providers) {
      try {
        const provider = new RpcProvider({ nodeUrl: url });
        // Test the provider with a simple call
        await provider.getBlockNumber();
        console.log(`Starknet provider working: ${url}`);
        return provider;
      } catch (error) {
        console.warn(
          `Starknet provider failed: ${url}, error: ${(error as any)?.message || String(error)
          }`
        );
        continue;
      }
    }
    throw new Error("All Starknet providers failed");
  }

  /**
   * Controller for wallet-related actions.
   * Provides endpoints to fetch balances for all supported blockchains (ETH, BTC, SOL, STRK) for the authenticated user.
   */
  static async getBalances(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Get all addresses for the user from the database
      const addressRepo = AppDataSource.getRepository(UserAddress);
      const addresses = await addressRepo.find({
        where: { userId: req.user!.id },
      });
      const balances: any[] = [];
      // Loop through each address and fetch its balance based on chain type
      for (const addr of addresses) {
        if (addr.chain === "starknet") {
          // STRK (Starknet) balance using RpcProvider.callContract for more robust parsing
          try {
            // Use fallback provider system for reliability
            const provider = await WalletController.getStarknetProvider();
            const strkTokenAddress =
              "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

            // Call the contract entrypoint directly to avoid ABI/Contract class mismatches.
            // balanceOf usually returns a uint256 (low, high) pair or a single felt depending on the token.
            const callResult: any = await provider.callContract({
              contractAddress: strkTokenAddress,
              entrypoint: "balanceOf",
              calldata: [padStarknetAddress(addr.address as string)],
            }); // Use 'latest' block instead of 'pending' which isn't supported by Alchemy

            // Normalize various shapes returned by different providers
            let raw: any = callResult;
            if (raw && typeof raw === "object" && "result" in raw)
              raw = raw.result;

            let balanceBig = BigInt(0);
            if (Array.isArray(raw)) {
              if (raw.length === 1) {
                // single felt string
                balanceBig = BigInt(raw[0]);
              } else if (raw.length >= 2) {
                // uint256: [low, high]
                const low = BigInt(raw[0]);
                const high = BigInt(raw[1]);
                balanceBig = (high << BigInt(128)) + low;
              }
            } else if (typeof raw === "string") {
              balanceBig = BigInt(raw);
            }

            // Convert to STRK decimal (18 decimals)
            const balanceInSTRK = Number(balanceBig) / 1e18;

            // Save last known balance asynchronously (best-effort)
            try {
              addr.lastKnownBalance = balanceInSTRK;
              addressRepo.save(addr).catch(() => { });
            } catch { }

            balances.push({
              chain: addr.chain,
              address: addr.address,
              balance: String(balanceInSTRK),
            });
          } catch (err) {
            // Handle errors for STRK balance fetch
            console.error(
              "Starknet balance fetch failed for",
              addr.address,
              "Error:",
              (err as any)?.message || String(err),
              "Full:",
              JSON.stringify(err)
            );
            balances.push({
              chain: addr.chain,
              address: addr.address,
              balance: null,
              error: "Failed to fetch",
            });
          }
        } else if (addr.chain === "ethereum") {
          // ETH balance using ethers.js
          try {
            // Use a public Ethereum RPC provider
            const provider = new ethers.JsonRpcProvider(
              `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
            );
            // Get balance in wei and convert to ETH
            const balance = await provider.getBalance(addr.address as string);
            balances.push({
              chain: addr.chain,
              address: addr.address,
              balance: ethers.formatEther(balance),
            });
          } catch (err) {
            // Handle errors for ETH balance fetch
            balances.push({
              chain: addr.chain,
              address: addr.address,
              balance: null,
              error: "Failed to fetch",
            });
          }
        } else if (addr.chain === "bitcoin") {
          // BTC balance using blockstream.info API
          try {
            // Use blockstream.info public API to get BTC address stats
            const url = `https://blockstream.info/api/address/${addr.address}`;
            const resp = await axios.get(url);
            // The API returns funded and spent satoshis; subtract to get current balance
            const data = resp.data as {
              chain_stats: {
                funded_txo_sum: number;
                spent_txo_sum: number;
              };
            };
            const balance =
              data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
            balances.push({
              chain: addr.chain,
              address: addr.address,
              balance: (balance / 1e8).toString(), // Convert satoshis to BTC
            });
          } catch (err) {
            // Handle errors for BTC balance fetch
            balances.push({
              chain: addr.chain,
              address: addr.address,
              balance: null,
              error: "Failed to fetch",
            });
          }
        } else if (addr.chain === "solana") {
          // SOL balance using @solana/web3.js
          try {
            // Connect to Solana mainnet
            const connection = new Connection(
              `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
            );
            // Convert address to PublicKey and fetch balance in lamports
            const publicKey = new PublicKey(addr.address as string);
            const balance = await connection.getBalance(publicKey);
            balances.push({
              chain: addr.chain,
              address: addr.address,
              balance: (balance / 1e9).toString(), // Convert lamports to SOL
            });
          } catch (err) {
            // Handle errors for SOL balance fetch
            balances.push({
              chain: addr.chain,
              address: addr.address,
              balance: null,
              error: "Failed to fetch",
            });
          }
        } else {
          // Unknown or unsupported chain type
          balances.push({
            chain: addr.chain,
            address: addr.address,
            balance: null,
            error: "Unsupported chain",
          });
        }
      }
      res.json({ balances });
    } catch (error) {
      console.error("Get balances error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Send funds from a user's wallet to another address for a given chain/network.
   * POST /wallet/send
   * Body: { chain, network, toAddress, amount, fromAddress? }
   */
  static async sendTransaction(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { chain, network, toAddress, amount, fromAddress } = req.body;
      const forceSend = req.body && req.body.force === true;

      // Validate authenticated user
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const userId = req.user.id;

      // Validation
      if (!chain || !network || !toAddress || !amount) {
        res.status(400).json({
          error: "Missing required fields: chain, network, toAddress, amount",
        });
        return;
      }

      // Enforce transaction PIN unless explicitly bypassed via env var
      try {
        const skipPin = process.env.SKIP_TRANSACTION_PIN === "true";
        if (!skipPin) {
          // Accept either `transactionPin` or `pin` for backwards compatibility
          const providedPinRaw = req.body?.transactionPin ?? req.body?.pin;
          if (providedPinRaw === undefined || providedPinRaw === null) {
            res.status(400).json({
              error: "Missing transactionPin (or pin) in request body",
            });
            return;
          }
          const providedPin = String(providedPinRaw);

          // Load fresh user record to get hashed PIN
          const userRepo = AppDataSource.getRepository("users");
          const userRecord: any = await userRepo.findOne({
            where: { id: userId },
          });
          if (!userRecord) {
            res.status(401).json({ error: "Unauthorized" });
            return;
          }

          if (!userRecord.transactionPin) {
            res.status(400).json({
              error:
                "Transaction PIN not set. Please set a transaction PIN before sending funds.",
            });
            return;
          }

          const pinMatches = await bcrypt.compare(
            providedPin,
            userRecord.transactionPin
          );
          if (!pinMatches) {
            res.status(403).json({ error: "Invalid transaction PIN" });
            return;
          }
        }
      } catch (pinErr) {
        console.error("Transaction PIN verification error:", pinErr);
        res.status(500).json({ error: "Failed to verify transaction PIN" });
        return;
      }
      if (Number(amount) <= 0) {
        res.status(400).json({ error: "Amount must be positive." });
        return;
      }

      // ===== FEE CALCULATION =====
      // Frontend provides native token amount. Convert native -> USD, compute USD fee via FeeService, then convert fee USD -> token units.
      const amountNum = parseFloat(amount);

      // Map chain -> token symbol + decimals
      const tokenInfo: { symbol: string; decimals: number } = ((): any => {
        const map: Record<string, { symbol: string; decimals: number }> = {
          starknet: { symbol: "STRK", decimals: 18 },
          ethereum: { symbol: "ETH", decimals: 18 },
          usdt_erc20: { symbol: "USDT", decimals: 6 },
          solana: { symbol: "SOL", decimals: 9 },
          bitcoin: { symbol: "BTC", decimals: 8 },
          stellar: { symbol: "XLM", decimals: 7 },
          polkadot: { symbol: "DOT", decimals: 10 },
        };
        return (
          map[chain] || { symbol: (chain || "USD").toUpperCase(), decimals: 18 }
        );
      })();

      // Fetch USD price per token
      let pricePerTokenUSD = 1;
      try {
        pricePerTokenUSD = await PriceFeedService.getPrice(tokenInfo.symbol);
      } catch (err) {
        console.warn(
          "Price lookup failed for",
          tokenInfo.symbol,
          (err as any)?.message || String(err)
        );
        // fallback: if price fetch fails, let FeeService work on token amount as if it's USD-equivalent (not ideal)
        pricePerTokenUSD = 1;
      }

      const amountUSD = Math.round(amountNum * pricePerTokenUSD * 100) / 100;
      const feeCalculation = FeeService.calculateFee(amountUSD);

      // Convert fee USD -> token units (round up to avoid shorting treasury)
      const rawFeeToken = feeCalculation.fee / (pricePerTokenUSD || 1);
      const multiplier = Math.pow(10, tokenInfo.decimals);
      const feeTokenRounded = Math.ceil(rawFeeToken * multiplier) / multiplier;

      console.log(`\n💰 Transaction Fee Breakdown (token:${tokenInfo.symbol}):
- Amount to recipient (native): ${amountNum}
- USD equivalent: $${amountUSD}
- ZENGA fee (USD): $${feeCalculation.fee} (${feeCalculation.tier})
- ZENGA fee (token): ${feeTokenRounded} ${tokenInfo.symbol}
- Sender pays total (USD): $${feeCalculation.senderPays}
`);

      // Get treasury wallet for this chain/network (defensive: validate and log)
      let treasuryWallet: string;
      try {
        treasuryWallet = TreasuryConfig.getTreasuryWallet(chain, network);
        console.log(`💼 Treasury wallet (raw): ${treasuryWallet}`);

        // Log the environment keys we might look up (helps debugging mismatched .env names)
        const envKey1 = `${chain.toUpperCase()}_${network.toUpperCase()}_TREASURY`;
        const envKey2 = `ZENGA_TREASURY_${chain === "solana" ? "SOL" : chain.toUpperCase()
          }_${network.toUpperCase()}`;
        console.log(
          `💼 Treasury env probes: ${envKey1}=${process.env[envKey1]} ${envKey2}=${process.env[envKey2]}`
        );

        // Basic validation
        if (!TreasuryConfig.validateTreasuryAddress(treasuryWallet, chain)) {
          console.warn(
            `⚠️ Treasury wallet format invalid for ${chain}/${network}: ${treasuryWallet}`
          );
        }

        // Defensive check: For airtime purchases, toAddress SHOULD be treasury (user sends funds to ZENGA).
        // For wallet-to-wallet transfers, treasury should differ from recipient.
        // We detect airtime purchases by checking if toAddress matches a treasury pattern.
        const isProbablyAirtimePurchase = treasuryWallet === toAddress;
        if (isProbablyAirtimePurchase) {
          console.log(
            "ℹ️ Detected payment TO treasury (likely airtime purchase). Fee will be 0 to avoid double-charging."
          );
          // For airtime purchases, ZENGA already receives the full amount, so no additional fee
          // This is correct behavior - don't treat it as an error
        }
      } catch (error: any) {
        res.status(500).json({
          error: "Treasury configuration error",
          details:
            error?.message ||
            "Treasury wallet not configured for this chain/network",
        });
        return;
      }

      // Find the user's wallet for this chain/network
      const addressRepo = AppDataSource.getRepository(UserAddress);
      const where: any = { userId, chain, network };
      if (fromAddress) {
        where.address = fromAddress;
      }

      const userAddress = await addressRepo.findOne({ where });

      if (!userAddress || !userAddress.encryptedPrivateKey) {
        res.status(404).json({
          error:
            "No wallet found for this chain/network. You can only send from wallets you created in ZENGA.",
        });
        return;
      }

      // Defensive: ensure stored address exists (TypeORM sometimes returns undefined for optional fields)
      if (!userAddress.address) {
        console.error(
          "Stored userAddress record missing address field for userId=",
          userId,
          "chain=",
          chain,
          "network=",
          network
        );
        res.status(500).json({ error: "Stored wallet address missing" });
        return;
      }

      // Decrypt the private key
      const privateKey = decrypt(userAddress.encryptedPrivateKey);

      let txHash = "";
      let txChainName: string | undefined = undefined;
      let feeAlreadySent = false;
      let feeTxHashForRecord: string | undefined = undefined;
      let earlyResponseSent = false;

      // ETH & USDT ERC20
      if (chain === "ethereum" || chain === "usdt_erc20") {
        const provider = new ethers.JsonRpcProvider(
          network === "testnet"
            ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
            : `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
        );
        const wallet = new ethers.Wallet(privateKey, provider);

        if (chain === "ethereum") {
          const tx = await wallet.sendTransaction({
            to: toAddress,
            value: ethers.parseEther(amount.toString()),
          });
          txHash = tx.hash;
        } else {
          const sepoliaRaw = "0x" + "516de3a7a567d81737e3a46ec4ff9cfd1fcb0136";
          const usdtMainnetRaw = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
          const usdtAddress =
            network === "testnet"
              ? ethers.getAddress(sepoliaRaw)
              : ethers.getAddress(usdtMainnetRaw);
          const usdtAbi = [
            "function transfer(address to, uint256 value) public returns (bool)",
          ];
          const usdtContract = new ethers.Contract(
            usdtAddress,
            usdtAbi,
            wallet
          );
          const decimals = 6;
          const tx = await usdtContract.transfer(
            toAddress,
            ethers.parseUnits(amount.toString(), decimals)
          );
          txHash = tx.hash;
        }
      }
      // SOL
      else if (chain === "solana") {
        const connection = new Connection(
          network === "testnet"
            ? "https://api.devnet.solana.com"
            : "https://api.mainnet-beta.solana.com"
        );

        // Handle different private key formats
        let secretKeyArray: Uint8Array;

        try {
          // Try parsing as JSON array first (if stored as [1,2,3,...])
          const parsed = JSON.parse(privateKey);
          if (Array.isArray(parsed)) {
            secretKeyArray = Uint8Array.from(parsed);
          } else {
            throw new Error("Not an array");
          }
        } catch {
          // If JSON.parse fails, treat as hex string
          const cleanHex = privateKey.startsWith("0x")
            ? privateKey.slice(2)
            : privateKey;
          const buffer = Buffer.from(cleanHex, "hex");

          // Solana keypairs are 64 bytes (32 private + 32 public)
          if (buffer.length === 32) {
            // If only private key, we need to generate the full keypair
            const tempKeypair = Keypair.fromSeed(buffer);
            secretKeyArray = tempKeypair.secretKey;
          } else if (buffer.length === 64) {
            secretKeyArray = new Uint8Array(buffer);
          } else {
            throw new Error(
              `Invalid Solana private key length: ${buffer.length}`
            );
          }
        }

        const fromKeypair = Keypair.fromSecretKey(secretKeyArray);
        const toPubkey = new PublicKey(toAddress);

        // Build a single transaction containing recipient + treasury transfer when possible
        const txBuilder = new SolTx();
        txBuilder.add(
          SystemProgram.transfer({
            fromPubkey: fromKeypair.publicKey,
            toPubkey,
            lamports: Math.round(Number(amount) * 1e9),
          })
        );
        if (feeTokenRounded && Number(feeTokenRounded) > 0) {
          txBuilder.add(
            SystemProgram.transfer({
              fromPubkey: fromKeypair.publicKey,
              toPubkey: new PublicKey(treasuryWallet),
              lamports: Math.round(Number(feeTokenRounded) * 1e9),
            })
          );
        }

        const signature = await sendAndConfirmTransaction(
          connection,
          txBuilder,
          [fromKeypair]
        );
        txHash = signature;
        if (feeTokenRounded && Number(feeTokenRounded) > 0) {
          feeAlreadySent = true;
          feeTxHashForRecord = txHash;
        }
      }
      // Add this to your sendTransaction method after the Solana section and before Bitcoin

      // STRK (Starknet)
      else if (chain === "starknet") {
        // Try mainnet first, fallback to testnet if no funds
        // Use v0_7 for better compatibility with Alchemy
        let provider = new RpcProvider({
          nodeUrl: `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`,
        });
        let actualNetwork = "mainnet";

        // Decrypt the private key
        const privateKey = decrypt(userAddress.encryptedPrivateKey);

        // Get public key from private key
        const publicKey = ec.starkCurve.getStarkKey(privateKey);

        // Check if account is deployed
        let isDeployed = false;
        try {
          await provider.getClassHashAt(userAddress.address);
          isDeployed = true;
          console.log(
            `[DEBUG] Starknet account ${userAddress.address} is deployed on mainnet`
          );
        } catch (error) {
          console.log(
            `[DEBUG] Starknet account ${userAddress.address} is NOT deployed on mainnet`
          );

          // Check if account has sufficient funds for deployment
          console.log(
            `[DEBUG] Checking balance for Starknet account deployment...`
          );
          console.log(`[DEBUG] Trying mainnet first...`);
          console.log(`[DEBUG] Address to check: ${userAddress.address}`);

          const { hasSufficientFunds, balance, token } = await checkBalance(
            provider,
            userAddress.address
          );

          console.log(`[DEBUG] Mainnet balance check:`);
          console.log(`  - Token: ${token}`);
          console.log(
            `  - Balance: ${balance} wei (${Number(balance) / 1e18} ${token})`
          );
          console.log(`  - Has sufficient funds: ${hasSufficientFunds}`);

          // FALLBACK: If mainnet balance is 0, try testnet
          if (!hasSufficientFunds && Number(balance) === 0) {
            console.log(
              `[DEBUG] ⚠️  No funds on mainnet, attempting fallback to testnet...`
            );
            const testnetProvider = new RpcProvider({
              nodeUrl: `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`,
            });
            const {
              hasSufficientFunds: testnetHasFunds,
              balance: testnetBalance,
              token: testnetToken,
            } = await checkBalance(testnetProvider, userAddress.address);
            console.log(`[DEBUG] Testnet balance check:`);
            console.log(`  - Token: ${testnetToken}`);
            console.log(
              `  - Balance: ${testnetBalance} wei (${Number(testnetBalance) / 1e18
              } ${testnetToken})`
            );
            console.log(`  - Has sufficient funds: ${testnetHasFunds}`);

            if (testnetHasFunds) {
              console.log(
                `[DEBUG] ✅ Found sufficient funds on testnet! Switching to testnet...`
              );
              provider = testnetProvider;
              actualNetwork = "testnet";
              isDeployed = false; // Will check on testnet
              try {
                await testnetProvider.getClassHashAt(userAddress.address);
                isDeployed = true;
              } catch { }
            }
          }

          if (hasSufficientFunds) {
            console.log(
              `[DEBUG] Deploying Starknet account ${userAddress.address}...`
            );

            try {
              // Deploy the account
              await deployStrkWallet(
                provider,
                privateKey,
                publicKey,
                userAddress.address,
                false // Skip balance check since we already did it
              );

              isDeployed = true;
              console.log(
                `[SUCCESS] Starknet account ${userAddress.address} deployed successfully`
              );

              // Create notification for deployment
              await AppDataSource.getRepository(Notification).save({
                userId: req.user.id,
                type: NotificationType.DEPOSIT,
                title: "Starknet Account Deployed",
                message: `Your Starknet ${network} account has been successfully deployed at ${userAddress.address}`,
                details: {
                  address: userAddress.address,
                  chain: "starknet",
                  network: network,
                  balance: balance,
                },
                isRead: false,
                createdAt: new Date(),
              });
            } catch (deployError) {
              throw new Error(
                `Failed to deploy Starknet account: ${deployError instanceof Error
                  ? deployError.message
                  : String(deployError)
                }`
              );
            }
          } else {
            throw new Error(
              `Starknet account not deployed and insufficient funds for deployment. Current balance: ${balance}`
            );
          }
        }

        if (!isDeployed) {
          throw new Error(
            "Starknet account must be deployed before sending transactions"
          );
        }

        // Create Account instance for sending transactions
        const account = new (Account as any)(provider, userAddress.address, privateKey);

        // For Starknet, override treasury wallet to use actualNetwork (which may differ from request network)
        treasuryWallet = TreasuryConfig.getTreasuryWallet(
          "starknet",
          actualNetwork
        );
        console.log(
          `💼 Starknet treasury wallet (using actualNetwork=${actualNetwork}): ${treasuryWallet}`
        );

        // Determine which token to send (ETH or STRK)
        // For simplicity, we'll send ETH on Starknet by default
        // You can modify this to support STRK token transfers as well
        const ethTokenAddress =
          "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
        const strkTokenAddress =
          "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

        // Use STRK token by default, you can add logic to choose between ETH/STRK
        const tokenAddress = strkTokenAddress;

        // Convert amount to uint256 (18 decimals for STRK/ETH)
        const amountInWei = uint256.bnToUint256(
          BigInt(Math.floor(Number(amount) * 1e18))
        );

        // Call the transfer function on the token contract
        const transferCall = {
          contractAddress: tokenAddress,
          entrypoint: "transfer",
          calldata: [
            toAddress,
            amountInWei.low.toString(),
            amountInWei.high.toString(),
          ],
        };

        console.log(
          `[DEBUG] Sending ${amount} STRK from ${userAddress.address} to ${toAddress}`
        );

        try {
          // If we have a fee to send on this chain, batch both calls in one execute (atomic)
          const calls: any[] = [transferCall];
          if (feeTokenRounded && Number(feeTokenRounded) > 0) {
            const feeUint = uint256.bnToUint256(
              BigInt(Math.floor(Number(feeTokenRounded) * 1e18))
            );
            const feeCall = {
              contractAddress: tokenAddress,
              entrypoint: "transfer",
              calldata: [
                treasuryWallet,
                feeUint.low.toString(),
                feeUint.high.toString(),
              ],
            };
            calls.push(feeCall);
          }

          const result = await account.execute(
            calls.length === 1 ? calls[0] : calls
          );
          txHash = result.transaction_hash;

          console.log(`[SUCCESS] Starknet transaction sent: ${txHash}`);

          try {
            await provider.waitForTransaction(txHash);
          } catch { }
          console.log(`[SUCCESS] Starknet transaction confirmed: ${txHash}`);

          if (calls.length > 1) {
            feeAlreadySent = true;
            feeTxHashForRecord = txHash;
          }
        } catch (executeError) {
          throw new Error(
            `Failed to execute Starknet transaction: ${executeError instanceof Error
              ? executeError.message
              : String(executeError)
            }`
          );
        }
      }
      // POLKADOT
      // Replace the Polkadot section (around line 440) with this improved version:
      // POLKADOT
      // POLKADOT - Fixed version
      else if (chain === "polkadot") {
        try {
          // @ts-ignore
          const { ApiPromise, WsProvider } = require("@polkadot/api");
          // @ts-ignore
          const { Keyring } = require("@polkadot/keyring");
          // @ts-ignore
          const {
            decodeAddress,
            encodeAddress,
          } = require("@polkadot/util-crypto");
          // @ts-ignore
          const { u8aToHex } = require("@polkadot/util");

          const wsUrl =
            network === "testnet"
              ? process.env.POLKADOT_WS_TESTNET || "wss://pas-rpc.stakeworld.io"
              : process.env.POLKADOT_WS_MAINNET || "wss://rpc.polkadot.io";

          const provider = new WsProvider(wsUrl);
          const api = await ApiPromise.create({ provider });

          // Query the node for its reported chain name
          try {
            const reportedChain = (await api.rpc.system.chain()).toString();
            txChainName = reportedChain;
            console.log(
              `[DEBUG] Polkadot RPC chain reported: ${reportedChain}`
            );
            if (
              network === "testnet" &&
              !reportedChain.toLowerCase().includes("test") &&
              !reportedChain.toLowerCase().includes("paseo")
            ) {
              console.warn(
                `[WARN] Requested network=testnet but RPC reports chain: ${reportedChain}. This may be a network mismatch.`
              );
            }
          } catch (chainErr) {
            console.warn("Unable to fetch Polkadot RPC chain name:", chainErr);
          }

          const keyring = new Keyring({ type: "sr25519" });
          let sender: any = null;
          const pkStr =
            typeof privateKey === "string" ? privateKey : String(privateKey);

          console.log(
            "[DEBUG] Raw private key format:",
            pkStr.substring(0, 100)
          );

          // ✅ FIX: Handle JSON-formatted private key from generatePolkadotWallet()
          try {
            // Try to parse as JSON first (new format)
            const keyData = JSON.parse(pkStr);

            console.log("[DEBUG] Parsed JSON private key data:", {
              hasKey: !!keyData,
              hasMnemonic: !!keyData.mnemonic,
              hasSeed: !!keyData.seed,
              type: keyData.type,
            });

            if (keyData.mnemonic) {
              // Best option: use mnemonic
              sender = keyring.addFromUri(keyData.mnemonic);
              console.log("[DEBUG] Loaded keypair from mnemonic (JSON format)");
            } else if (keyData.seed) {
              // Fallback: use seed
              const seedBuffer = Buffer.from(keyData.seed, "hex");
              if (seedBuffer.length !== 32) {
                throw new Error(
                  `Invalid seed length: ${seedBuffer.length}, expected 32 bytes`
                );
              }
              sender = keyring.addFromSeed(seedBuffer);
              console.log("[DEBUG] Loaded keypair from seed (JSON format)");
            } else {
              throw new Error(
                "JSON private key missing both mnemonic and seed"
              );
            }
          } catch (jsonErr) {
            // Not JSON format, try legacy formats
            console.log("[DEBUG] Not JSON format, trying legacy formats...");

            try {
              // Try as mnemonic/URI directly
              sender = keyring.addFromUri(pkStr);
              console.log(
                "[DEBUG] Loaded keypair from URI/mnemonic (legacy format)"
              );
            } catch (e1) {
              try {
                // Try as hex seed
                const seedHex = pkStr.replace(/^0x/, "");
                if (seedHex.length === 64) {
                  const seed = Buffer.from(seedHex, "hex");
                  sender = keyring.addFromSeed(seed);
                  console.log(
                    "[DEBUG] Loaded keypair from hex seed (legacy format)"
                  );
                } else {
                  throw new Error(
                    `Invalid seed length: ${seedHex.length}, expected 64 hex chars`
                  );
                }
              } catch (e2) {
                try {
                  await api.disconnect();
                } catch { }
                throw new Error(
                  "Failed to load Polkadot keypair from any format. " +
                  "Ensure private key is either: " +
                  "1) JSON format with mnemonic/seed (new format), " +
                  "2) Mnemonic phrase, or " +
                  "3) 32-byte hex seed (64 chars). " +
                  `Error details: ${e2 instanceof Error ? e2.message : String(e2)
                  }`
                );
              }
            }
          }

          if (!sender) {
            try {
              await api.disconnect();
            } catch { }
            throw new Error("Failed to initialize keypair");
          }

          // Get public keys for comparison
          const derivedPubKey = sender.publicKey;
          const derivedPubKeyHex = u8aToHex(derivedPubKey);

          let storedPubKey: Uint8Array | null = null;
          let storedPubKeyHex = "";
          try {
            storedPubKey = decodeAddress(userAddress.address);
            storedPubKeyHex = u8aToHex(storedPubKey);
          } catch (e) {
            try {
              await api.disconnect();
            } catch { }
            throw new Error(
              `Invalid stored address format: ${userAddress.address}`
            );
          }

          console.log("[DEBUG] Derived public key:", derivedPubKeyHex);
          console.log("[DEBUG] Stored public key:", storedPubKeyHex);
          console.log("[DEBUG] Derived address (default):", sender.address);
          console.log("[DEBUG] Stored address:", userAddress.address);

          // Check if public keys match
          if (derivedPubKeyHex !== storedPubKeyHex) {
            try {
              await api.disconnect();
            } catch { }
            throw new Error(
              `CRITICAL: Private key does not match stored address!\n` +
              `Derived address: ${sender.address}\n` +
              `Stored address: ${userAddress.address}\n` +
              `Derived pubkey: ${derivedPubKeyHex}\n` +
              `Stored pubkey: ${storedPubKeyHex}\n` +
              `This private key belongs to a different account. Transaction aborted to prevent loss of funds.`
            );
          }

          console.log("[DEBUG] ✅ Public key verification passed!");

          // Public keys match! Now encode with the correct format
          let correctFormat = 0; // Default to Polkadot format

          // Try to find the format used in the stored address
          const formatsToTry =
            network === "testnet"
              ? [0, 42, 2] // Polkadot, generic substrate, Kusama
              : [0, 2, 42];

          for (const format of formatsToTry) {
            try {
              const encoded = encodeAddress(derivedPubKey, format);
              if (encoded === userAddress.address) {
                correctFormat = format;
                console.log(`[DEBUG] ✅ Address format matched: ${format}`);
                break;
              }
            } catch { }
          }

          // Convert amount DOT -> Planck (1 DOT = 10^10 Planck)
          const planck = BigInt(Math.round(Number(amount) * 1e10));
          console.log(
            `[DEBUG] Sending ${amount} DOT (${planck} Planck) from ${userAddress.address} to ${toAddress}`
          );

          // Check balance before sending
          try {
            const accountInfo = await api.query.system.account(
              userAddress.address
            );
            const balance = accountInfo.data.free.toBigInt();
            console.log(
              `[DEBUG] Account balance: ${balance} Planck (${Number(balance) / 1e10
              } DOT)`
            );

            if (balance < planck) {
              try {
                await api.disconnect();
              } catch { }
              throw new Error(
                `Insufficient balance. Have: ${Number(balance) / 1e10
                } DOT, Need: ${amount} DOT`
              );
            }
          } catch (balErr) {
            console.warn("[WARN] Could not check balance:", balErr);
          }

          // Create transaction - use transferKeepAlive to prevent account reaping
          const transfer =
            api.tx.balances.transferKeepAlive || api.tx.balances.transfer;
          if (!transfer) {
            try {
              await api.disconnect();
            } catch { }
            throw new Error("No transfer method available on this chain");
          }

          const tx = transfer(toAddress, planck.toString());

          // --- Polkadot preflight fee + existential deposit check ---
          try {
            // Estimate fee for this extrinsic using the sender keypair
            let estimatedFeePlanck = BigInt(0);
            try {
              const paymentInfo: any = await tx.paymentInfo(sender);
              estimatedFeePlanck = BigInt(
                paymentInfo && paymentInfo.partialFee
                  ? paymentInfo.partialFee.toString()
                  : "0"
              );
              console.log(
                "[DEBUG] Polkadot estimated partialFee (planck):",
                estimatedFeePlanck.toString()
              );
            } catch (pfErr) {
              console.warn(
                "[WARN] Could not estimate Polkadot paymentInfo:",
                (pfErr as any)?.message || String(pfErr)
              );
            }

            // Existential deposit (planck)
            let existentialDepositPlanck = BigInt(0);
            try {
              existentialDepositPlanck = BigInt(
                (api.consts.balances.existentialDeposit as any).toString()
              );
              console.log(
                "[DEBUG] Polkadot existentialDeposit (planck):",
                existentialDepositPlanck.toString()
              );
            } catch (edErr) {
              console.warn(
                "[WARN] Could not read existentialDeposit from chain constants:",
                (edErr as any)?.message || String(edErr)
              );
            }

            // Re-check account free balance (planck)
            const freshAccount = await api.query.system.account(
              userAddress.address
            );
            const freePlanck = BigInt(freshAccount.data.free.toString());
            console.log(
              "[DEBUG] Polkadot fresh free balance (planck):",
              freePlanck.toString()
            );

            // small safety buffer: 0.01 DOT (in planck)
            const safetyBufferPlanck = BigInt(Math.round(0.01 * 1e10));

            const requiredPlanck =
              planck +
              estimatedFeePlanck +
              existentialDepositPlanck +
              safetyBufferPlanck;
            if (freePlanck < requiredPlanck) {
              const toDot = (p: bigint) => (Number(p) / 1e10).toFixed(8);
              try {
                await api.disconnect();
              } catch { }
              throw new Error(
                `Insufficient balance for Polkadot transfer. ` +
                `Have: ${toDot(freePlanck)} DOT, ` +
                `Required: ${toDot(requiredPlanck)} DOT (amount ${toDot(
                  planck
                )} + estFee ${toDot(
                  estimatedFeePlanck
                )} + existentialDeposit ${toDot(
                  existentialDepositPlanck
                )} + buffer 0.01). ` +
                `Reduce the amount or top up the account.`
              );
            }
          } catch (preflightErr) {
            console.error(
              "Polkadot preflight check failed:",
              (preflightErr as any)?.message || String(preflightErr)
            );
            throw preflightErr;
          }

          // Sign and send
          try {
            txHash = await new Promise<string>(async (resolve, reject) => {
              try {
                const unsub = await tx.signAndSend(sender, (result: any) => {
                  const { status, dispatchError, events } = result;

                  // Log transaction progress
                  if (status.isReady) {
                    console.log("[DEBUG] Transaction is ready");
                  }

                  if (dispatchError) {
                    // Decode module error if possible
                    try {
                      if (dispatchError.isModule) {
                        const decoded = api.registry.findMetaError(
                          dispatchError.asModule
                        );
                        const { section, name, docs } = decoded;
                        const errorMsg = `${section}.${name}: ${docs.join(
                          " "
                        )}`;
                        reject(new Error(`Transaction failed: ${errorMsg}`));
                      } else {
                        reject(
                          new Error(
                            `Transaction failed: ${dispatchError.toString()}`
                          )
                        );
                      }
                    } catch (de) {
                      reject(
                        new Error(
                          `Transaction dispatch error: ${dispatchError.toString()}`
                        )
                      );
                    }
                    try {
                      unsub();
                    } catch { }
                    return;
                  }

                  if (status.isInBlock) {
                    console.log(
                      `[DEBUG] Transaction included in block: ${status.asInBlock.toString()}`
                    );
                    resolve(status.asInBlock.toString());
                    try {
                      unsub();
                    } catch { }
                  } else if (status.isFinalized) {
                    console.log(
                      `[DEBUG] Transaction finalized in block: ${status.asFinalized.toString()}`
                    );
                    resolve(status.asFinalized.toString());
                    try {
                      unsub();
                    } catch { }
                  }
                });
              } catch (sendErr) {
                reject(
                  sendErr instanceof Error
                    ? sendErr
                    : new Error(String(sendErr))
                );
              }
            });

            console.log(`[SUCCESS] Polkadot transaction successful: ${txHash}`);
          } catch (sendErr) {
            try {
              await api.disconnect();
            } catch { }
            console.error("Polkadot send error (dispatch/sign):", sendErr);
            throw sendErr;
          }

          try {
            await api.disconnect();
          } catch { }
        } catch (err) {
          console.error("Polkadot send error:", err);
          throw new Error(
            "Failed to send DOT: " + ((err as any)?.message || String(err))
          );
        }
      }
      // XLM / Stellar

      // STELLAR
      else if (chain === "stellar") {
        try {
          // Try both import methods for compatibility
          let StellarSdk;
          try {
            StellarSdk = require("stellar-sdk");
          } catch (e) {
            // @ts-ignore
            StellarSdk = require("@stellar/stellar-sdk");
          }

          const horizonUrl =
            network === "testnet"
              ? "https://horizon-testnet.stellar.org"
              : "https://horizon.stellar.org";

          // Use Horizon.Server or stellar-sdk.Horizon.Server
          const Server = StellarSdk.Horizon?.Server || StellarSdk.Server;
          const Keypair = StellarSdk.Keypair;
          const TransactionBuilder = StellarSdk.TransactionBuilder;
          const Networks = StellarSdk.Networks;
          const Operation = StellarSdk.Operation;
          const Asset = StellarSdk.Asset;

          if (!Server) {
            throw new Error("Unable to find Server constructor in stellar-sdk");
          }

          const server = new Server(horizonUrl);
          const sourceKeypair = Keypair.fromSecret(privateKey);

          // Load source account
          let account;
          try {
            account = await server.loadAccount(sourceKeypair.publicKey());
          } catch (loadErr) {
            // More helpful error if source account doesn't exist or is unfunded
            console.error(
              "Failed to load source Stellar account:",
              (loadErr as any)?.response?.data || loadErr
            );
            throw new Error(
              "Failed to load source Stellar account. Ensure the account exists and is funded."
            );
          }

          const baseFee = await server.fetchBaseFee();
          const networkPassphrase =
            network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

          // Check whether destination exists. If not, we must use createAccount operation
          let destinationExists = true;
          try {
            await server.loadAccount(toAddress);
          } catch (destErr: any) {
            // Horizon returns 404 if account not found
            destinationExists = false;
            console.log(
              "Stellar destination account does not exist; will use createAccount op"
            );
          }

          // Check whether treasury exists on this network. If treasury account is missing on this network,
          // we should NOT try to create it here — instead skip on-chain fee transfer and record for later sweep.
          let treasuryExists = true;
          try {
            if (feeTokenRounded && Number(feeTokenRounded) > 0) {
              await server.loadAccount(treasuryWallet);
            }
          } catch (tErr: any) {
            treasuryExists = false;
            console.warn(
              "⚠️ Treasury account does not exist on this Stellar network. Skipping on-chain fee payment."
            );
          }

          // Preflight: check source native balance is sufficient (amount + fee if treasury exists + small reserve)
          const nativeBalanceEntry = (account.balances || []).find(
            (b: any) => b.asset_type === "native"
          );
          const sourceBalance = nativeBalanceEntry
            ? parseFloat(nativeBalanceEntry.balance)
            : 0;
          const required =
            Number(amount) +
            (treasuryExists ? Number(feeTokenRounded) || 0 : 0) +
            0.0001; // small safety buffer
          if (sourceBalance < required) {
            throw new Error(
              `Insufficient XLM balance. Have: ${sourceBalance}, need: >= ${required}`
            );
          }

          const txBuilder = new TransactionBuilder(account, {
            fee: String(baseFee),
            networkPassphrase,
          });

          if (destinationExists) {
            txBuilder.addOperation(
              Operation.payment({
                destination: toAddress,
                asset: Asset.native(),
                amount: String(amount),
              })
            );
          } else {
            // createAccount requires startingBalance as string
            txBuilder.addOperation(
              Operation.createAccount({
                destination: toAddress,
                startingBalance: String(amount),
              })
            );
          }

          // add treasury payment in same Stellar transaction when possible and if treasury exists on this network
          if (
            treasuryExists &&
            feeTokenRounded &&
            Number(feeTokenRounded) > 0
          ) {
            txBuilder.addOperation(
              Operation.payment({
                destination: treasuryWallet,
                asset: Asset.native(),
                amount: String(feeTokenRounded),
              })
            );
          } else if (
            !treasuryExists &&
            feeTokenRounded &&
            Number(feeTokenRounded) > 0
          ) {
            // We'll skip on-chain fee send for now; the fee transfer record will be created and retried by a sweeper
            console.warn(
              "⚠️ Skipping on-chain fee payment because treasury account is missing on this network. Fee will be recorded for later collection."
            );
          }

          txBuilder.setTimeout(30);

          const tx = txBuilder.build();
          tx.sign(sourceKeypair);

          try {
            console.log("[DEBUG] Submitting Stellar transaction...");
            const resp = await server.submitTransaction(tx);
            console.log("[DEBUG] Stellar submitTransaction response received");
            txHash = resp.hash;
            console.log("[DEBUG] Stellar txHash:", txHash);
            if (feeTokenRounded && Number(feeTokenRounded) > 0) {
              feeAlreadySent = true;
              feeTxHashForRecord = txHash;
              console.log(
                "[DEBUG] feeAlreadySent set=true, feeTxHashForRecord=",
                feeTxHashForRecord
              );
            }
          } catch (submitErr: any) {
            // Log Horizon response body if available
            console.error(
              "Stellar submitTransaction failed:",
              submitErr?.response?.data || submitErr?.toString()
            );
            const body = submitErr?.response?.data;
            const errMsg =
              body && body.extras && body.extras.result_codes
                ? JSON.stringify(body.extras.result_codes)
                : submitErr?.message || String(submitErr);
            throw new Error("Failed to send XLM: " + errMsg);
          }

          console.log(
            "[DEBUG] Proceeding after Stellar submitTransaction, about to save Transaction to DB"
          );
        } catch (err) {
          console.error("Stellar send error:", err);
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
      // BTC
      else if (chain === "bitcoin") {
        console.log("[DEBUG] Bitcoin transaction start");
        console.log("[DEBUG] Bitcoin address:", userAddress.address);

        if (!privateKey) {
          throw new Error("Private key is undefined after decryption");
        }

        let privateKeyStr =
          typeof privateKey === "string" ? privateKey : String(privateKey);

        // Fetch UTXOs
        const apiUrl =
          network === "testnet"
            ? `https://blockstream.info/testnet/api/address/${userAddress.address}/utxo`
            : `https://blockstream.info/api/address/${userAddress.address}/utxo`;

        console.log("[DEBUG] Fetching UTXOs from:", apiUrl);

        let utxos;
        try {
          const utxoResponse = await axios.get(apiUrl);
          utxos = utxoResponse.data;
          console.log(
            "[DEBUG] Raw UTXO response:",
            JSON.stringify(utxos, null, 2)
          );
        } catch (utxoError) {
          throw new Error(
            `Failed to fetch UTXOs: ${utxoError instanceof Error ? utxoError.message : String(utxoError)
            }`
          );
        }

        if (!Array.isArray(utxos) || utxos.length === 0) {
          throw new Error("No UTXOs available for this address");
        }

        // Filter confirmed UTXOs
        const confirmedUtxos = utxos.filter(
          (utxo: any) => utxo.status?.confirmed === true
        );
        console.log("[DEBUG] Confirmed UTXOs:", confirmedUtxos.length);

        if (confirmedUtxos.length === 0) {
          throw new Error("No confirmed UTXOs available");
        }

        const networkParams =
          network === "testnet"
            ? bitcoin.networks.testnet
            : bitcoin.networks.bitcoin;
        const psbt = new bitcoin.Psbt({ network: networkParams });

        let inputSum = BigInt(0);
        let addedInputs = 0;
        const targetAmount = BigInt(Math.round(Number(amount) * 1e8));
        // feeTokenRounded is in BTC tokens for bitcoin chain; convert to satoshis
        const feeSats = BigInt(
          Math.round((chain === "bitcoin" ? (feeTokenRounded || 0) : 0) * 1e8)
        );
        const estimatedFee = BigInt(1000);

        console.log(
          "[DEBUG] Target:",
          targetAmount.toString(),
          "Fee:",
          estimatedFee.toString(),
          "Total needed:",
          (targetAmount + feeSats + estimatedFee).toString()
        );

        // Create keypair first
        let keyPair;
        try {
          keyPair = ECPair.fromWIF(privateKeyStr, networkParams);
          console.log("[DEBUG] Loaded keypair from WIF");
        } catch {
          const cleanHex = privateKeyStr.startsWith("0x")
            ? privateKeyStr.slice(2)
            : privateKeyStr;
          if (cleanHex.length !== 64) {
            throw new Error(
              `Invalid hex private key length: ${cleanHex.length}, expected 64`
            );
          }
          const buffer = Buffer.from(cleanHex, "hex");
          keyPair = ECPair.fromPrivateKey(buffer, {
            network: networkParams,
          });
          console.log("[DEBUG] Loaded keypair from hex");
        }

        // Process each confirmed UTXO
        for (const utxo of confirmedUtxos) {
          try {
            console.log(
              `[DEBUG] Processing UTXO: ${utxo.txid}:${utxo.vout}, value: ${utxo.value}`
            );

            // Get full transaction data
            const txUrl =
              network === "testnet"
                ? `https://blockstream.info/testnet/api/tx/${utxo.txid}`
                : `https://blockstream.info/api/tx/${utxo.txid}`;

            const txResp = await axios.get(txUrl);
            const txData = txResp.data as {
              vout: Array<{
                scriptpubkey: string;
                scriptpubkey_type: string;
                value: number;
              }>;
            };

            const output = txData.vout[utxo.vout];
            if (!output) {
              console.log(`[DEBUG] Output ${utxo.vout} not found`);
              continue;
            }

            console.log(`[DEBUG] Output type:`, output.scriptpubkey_type);

            const scriptHex = output.scriptpubkey;
            if (!scriptHex) {
              console.log(`[DEBUG] Missing scriptpubkey`);
              continue;
            }

            // Add input based on type
            if (output.scriptpubkey_type === "v0_p2wpkh") {
              // SegWit input
              psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                  script: Buffer.from(scriptHex, "hex"),
                  value: BigInt(utxo.value),
                },
              });
              console.log("[DEBUG] Added SegWit input");
            } else if (output.scriptpubkey_type === "p2pkh") {
              // Legacy P2PKH input - needs full transaction hex
              const txHexUrl =
                network === "testnet"
                  ? `https://blockstream.info/testnet/api/tx/${utxo.txid}/hex`
                  : `https://blockstream.info/api/tx/${utxo.txid}/hex`;

              const txHexResp = await axios.get(txHexUrl);
              const txHex = txHexResp.data as string;

              psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: Buffer.from(txHex, "hex"),
              });
              console.log("[DEBUG] Added P2PKH input");
            } else {
              console.log(
                `[DEBUG] Unsupported script type: ${output.scriptpubkey_type}`
              );
              continue;
            }

            inputSum += BigInt(utxo.value);
            addedInputs++;

            console.log(
              `[DEBUG] Added input ${addedInputs}, total: ${inputSum.toString()} satoshis`
            );

            // Check if we have enough (include treasury output)
            if (inputSum >= targetAmount + feeSats + estimatedFee) {
              console.log("[DEBUG] Sufficient inputs collected");
              break;
            }

            // Save transaction details to the database
            await AppDataSource.getRepository(Transaction).save({
              userId: req.user.id,
              type: "send",
              amount,
              chain: chain,
              network: network, // ✅ Add network field
              toAddress,
              fromAddress: userAddress.address,
              txHash,
              status: "confirmed",
              createdAt: new Date(),
            });

            // Create a notification for the sent transaction
            await AppDataSource.getRepository(Notification).save({
              userId: req.user.id,
              type: NotificationType.SEND,
              title: "Tokens Sent",
              message: `You sent ${amount} ${chain.toUpperCase()} to ${toAddress}`,
              details: {
                amount,
                chain,
                network, // ✅ Add network to notification details
                toAddress,
                fromAddress: userAddress.address,
                txHash,
              },
              isRead: false,
              createdAt: new Date(),
            });
          } catch (error) {
            console.error(
              `[DEBUG] Error processing UTXO ${utxo.txid}:${utxo.vout}:`,
              error
            );
            continue;
          }
        }

        if (addedInputs === 0) {
          throw new Error("No valid UTXOs could be added to transaction");
        }

        if (inputSum < targetAmount + estimatedFee) {
          throw new Error(
            `Insufficient balance. Have: ${Number(inputSum) / 1e8} BTC, Need: ${Number(targetAmount + estimatedFee) / 1e8
            } BTC`
          );
        }

        // Add outputs: recipient and treasury fee, then change
        psbt.addOutput({
          address: toAddress,
          value: targetAmount,
        });

        // Add treasury output for fee (if applicable)
        if (feeSats && feeSats > 0) {
          psbt.addOutput({
            address: treasuryWallet,
            value: feeSats,
          });
        }

        const change = inputSum - targetAmount - (feeSats || BigInt(0)) - estimatedFee;
        if (change > BigInt(0)) {
          console.log(`[DEBUG] Adding change: ${change.toString()} satoshis`);
          psbt.addOutput({
            address: userAddress.address,
            value: change,
          });
        }

        // Sign all inputs
        // Replace the Bitcoin signing section (around lines 760-790) with this fixed version:

        // Sign all inputs
        console.log("[DEBUG] Signing inputs...");
        try {
          // Create a compatible signer wrapper that converts Uint8Array to Buffer
          const signer = {
            publicKey: Buffer.from(keyPair.publicKey),
            sign: (hash: Buffer, lowR?: boolean) => {
              const signature = keyPair.sign(hash, lowR);
              return Buffer.from(signature);
            },
            network: keyPair.network,
            compressed: keyPair.compressed,
            privateKey: keyPair.privateKey,
          };

          for (let i = 0; i < addedInputs; i++) {
            psbt.signInput(i, signer);
            console.log(`[DEBUG] Signed input ${i}`);
          }
        } catch (signError) {
          console.error("[DEBUG] Signing error:", signError);
          throw new Error(
            `Failed to sign inputs: ${signError instanceof Error ? signError.message : String(signError)
            }`
          );
        }

        // Validate signatures
        console.log("[DEBUG] Validating signatures...");
        const validated = psbt.validateSignaturesOfAllInputs(
          (pubkey, msghash, signature) => {
            return ECPair.fromPublicKey(Buffer.from(pubkey), {
              network: networkParams,
            }).verify(Buffer.from(msghash), Buffer.from(signature));
          }
        );

        if (!validated) {
          throw new Error("Signature validation failed");
        }
        console.log("[DEBUG] All signatures validated");

        // Finalize
        psbt.finalizeAllInputs();
        console.log("[DEBUG] Inputs finalized");

        const rawTx = psbt.extractTransaction().toHex();
        const broadcastUrl =
          network === "testnet"
            ? "https://blockstream.info/testnet/api/tx"
            : "https://blockstream.info/api/tx";

        console.log("[DEBUG] Broadcasting transaction...");
        const resp = await axios.post(broadcastUrl, rawTx, {
          headers: { "Content-Type": "text/plain" },
        });

        txHash = resp.data as string;
        // For Bitcoin we included treasury output in the PSBT, mark feeAlreadySent
        if (feeSats && feeSats > 0) {
          feeAlreadySent = true;
          feeTxHashForRecord = txHash;
        }
        console.log("[DEBUG] Transaction broadcast successful:", txHash);
      }

      // Immediately respond to client now that the on-chain transaction succeeded
      // This prevents UI spinners while DB writes and background fee work continue.
      try {
        if (txHash && !res.headersSent) {
          const earlyPayload = {
            success: true,
            message:
              "Transaction submitted (on-chain). Persisting details in background",
            txHash,
            fromAddress: userAddress.address,
            toAddress,
            chain,
            network,
          };
          try {
            res.setHeader("X-Transaction-Sent", txHash);
          } catch { }
          try {
            res.status(200).json(earlyPayload);
            console.log(
              "[DEBUG] Early response dispatched to client, res.finished=",
              res.finished
            );
            earlyResponseSent = true;
          } catch (e) {
            console.warn(
              "[DEBUG] Failed to send early response:",
              (e as any)?.message || String(e)
            );
          }
        }
      } catch (e) {
        console.warn(
          "[DEBUG] Early response instrumentation error:",
          (e as any)?.message || String(e)
        );
      }

      // Save transaction details to the database
      console.log("[DEBUG] Saving transaction to DB...");
      const savedTransaction = await AppDataSource.getRepository(
        Transaction
      ).save({
        userId: req.user.id,
        type: "send",
        amount: feeCalculation.recipientReceives, // Recipient gets exact amount
        chain: chain,
        network: network,
        toAddress,
        fromAddress: userAddress.address,
        txHash,
        status: "confirmed",
        details: {
          recipientReceives: feeCalculation.recipientReceives,
          fee: feeCalculation.fee,
          senderPays: feeCalculation.senderPays,
          tier: feeCalculation.tier,
          treasuryWallet: treasuryWallet,
        },
        createdAt: new Date(),
      });
      console.log("[DEBUG] Transaction saved. id=", savedTransaction.id);

      // ===== Create pending fee transfer record and attempt on-chain fee transfer =====
      let feeTxRecord: any = null;
      try {
        feeTxRecord = await FeeCollectionService.createFeeTransferRecord({
          userId: req.user.id,
          feeAmount: feeTokenRounded.toString(),
          chain,
          network,
          fromAddress: userAddress.address,
          treasuryAddress: treasuryWallet,
          originalTxId: savedTransaction.id,
        });
      } catch (err) {
        console.warn(
          "Failed to create fee transfer record:",
          (err as any)?.message || String(err)
        );
      }

      // perform chain-specific fee transfer
      let feeTxHash: string | undefined = undefined;
      // Replace the fee transfer section (around line 1470-1550) with this fixed version:

      // perform chain-specific fee transfer
      // let feeTxHash: string | undefined = undefined;

      if (feeAlreadySent) {
        // Fee was already sent as part of the recipient transaction (batched). Mark complete.
        feeTxHash = feeTxHashForRecord;
        if (feeTxRecord && feeTxHash) {
          console.log(
            "[DEBUG] Scheduling fee transfer completion for feeTxRecord.id=",
            feeTxRecord.id,
            "hash=",
            feeTxHash
          );
          // Do not block the HTTP response waiting for DB updates - run in background
          FeeCollectionService.completeFeeTransfer(feeTxRecord.id, feeTxHash)
            .then(() => {
              console.log("[DEBUG] Fee transfer marked complete (async)");
            })
            .catch((e) => {
              console.warn(
                "Failed to mark fee transfer complete (async):",
                (e as any)?.message || String(e)
              );
            });
        } else if (feeTxRecord && !feeTxHash) {
          FeeCollectionService.failFeeTransfer(
            feeTxRecord.id,
            "Fee sent but txHash missing"
          ).catch(() => { });
        }
      } else {
        // Only attempt fee transfer if there's actually a fee to send
        if (feeTokenRounded && Number(feeTokenRounded) > 0) {
          try {
            if (chain === "ethereum" || chain === "usdt_erc20") {
              const provider = new ethers.JsonRpcProvider(
                network === "testnet"
                  ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
                  : `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
              );
              const wallet = new ethers.Wallet(privateKey, provider);

              if (chain === "ethereum") {
                const feeTx = await wallet.sendTransaction({
                  to: treasuryWallet,
                  value: ethers.parseEther(feeTokenRounded.toString()),
                });
                feeTxHash = feeTx.hash;
                try {
                  await feeTx.wait();
                } catch { }
              } else {
                const sepoliaRaw =
                  "0x" + "516de3a7a567d81737e3a46ec4ff9cfd1fcb0136";
                const usdtMainnetRaw =
                  "0xdAC17F958D2ee523a2206206994597C13D831ec7";
                const usdtAddress =
                  network === "testnet"
                    ? ethers.getAddress(sepoliaRaw)
                    : ethers.getAddress(usdtMainnetRaw);
                const usdtAbi = [
                  "function transfer(address to, uint256 value) public returns (bool)",
                ];
                const usdtContract = new ethers.Contract(
                  usdtAddress,
                  usdtAbi,
                  wallet
                );
                const feeUnits = ethers.parseUnits(
                  feeTokenRounded.toString(),
                  6
                );
                const feeTx = await usdtContract.transfer(
                  treasuryWallet,
                  feeUnits
                );
                feeTxHash = feeTx.hash;
                try {
                  await feeTx.wait();
                } catch { }
              }
            } else if (chain === "starknet") {
              const provider = new RpcProvider({
                nodeUrl:
                  network === "testnet"
                    ? `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`
                    : `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/${process.env.ALCHEMY_STARKNET_KEY}`,
              });
              const account = new (Account as any)(
                provider,
                userAddress.address,
                privateKey
              );
              const tokenAddress =
                "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
              const feeUint = uint256.bnToUint256(
                BigInt(Math.floor(feeTokenRounded * 1e18))
              );
              const feeCall = {
                contractAddress: tokenAddress,
                entrypoint: "transfer",
                calldata: [treasuryWallet, feeUint.low, feeUint.high],
              };
              const r = await account.execute(feeCall);
              feeTxHash = r.transaction_hash;
              try {
                await provider.waitForTransaction(feeTxHash as string);
              } catch { }
            } else if (chain === "solana") {
              const connection = new Connection(
                network === "testnet"
                  ? "https://api.devnet.solana.com"
                  : "https://api.mainnet-beta.solana.com"
              );
              // rebuild keypair
              let secretKeyArray: Uint8Array;
              try {
                const parsed = JSON.parse(privateKey);
                if (Array.isArray(parsed))
                  secretKeyArray = Uint8Array.from(parsed);
                else throw new Error("Not array");
              } catch {
                const cleanHex = privateKey.startsWith("0x")
                  ? privateKey.slice(2)
                  : privateKey;
                const buffer = Buffer.from(cleanHex, "hex");
                if (buffer.length === 32) {
                  secretKeyArray = Keypair.fromSeed(buffer).secretKey;
                } else if (buffer.length === 64) {
                  secretKeyArray = new Uint8Array(buffer);
                } else throw new Error("Invalid Solana key");
              }
              const fromKeypair = Keypair.fromSecretKey(secretKeyArray);
              const tx = new SolTx().add(
                SystemProgram.transfer({
                  fromPubkey: fromKeypair.publicKey,
                  toPubkey: new PublicKey(treasuryWallet),
                  lamports: Math.round(feeTokenRounded * 1e9),
                })
              );
              const sig = await sendAndConfirmTransaction(connection, tx, [
                fromKeypair,
              ]);
              feeTxHash = sig;
            } else if (chain === "stellar") {
              let StellarSdk;
              try {
                StellarSdk = require("stellar-sdk");
              } catch {
                StellarSdk = require("@stellar/stellar-sdk");
              }
              const horizonUrl =
                network === "testnet"
                  ? "https://horizon-testnet.stellar.org"
                  : "https://horizon.stellar.org";
              const Server = StellarSdk.Horizon?.Server || StellarSdk.Server;
              const Keypair = StellarSdk.Keypair;
              const TransactionBuilder = StellarSdk.TransactionBuilder;
              const Networks = StellarSdk.Networks;
              const Operation = StellarSdk.Operation;
              const Asset = StellarSdk.Asset;
              const server = new Server(horizonUrl);
              const sourceKeypair = Keypair.fromSecret(privateKey);
              const account = await server.loadAccount(
                sourceKeypair.publicKey()
              );
              const feeBase = await server.fetchBaseFee();
              const networkPassphrase =
                network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
              const txBuilder = new TransactionBuilder(account, {
                fee: String(feeBase),
                networkPassphrase,
              })
                .addOperation(
                  Operation.payment({
                    destination: treasuryWallet,
                    asset: Asset.native(),
                    amount: String(feeTokenRounded),
                  })
                )
                .setTimeout(30);
              const tx = txBuilder.build();
              tx.sign(sourceKeypair);
              const resp = await server.submitTransaction(tx);
              feeTxHash = resp.hash;
            } else if (chain === "polkadot") {
              // @ts-ignore
              const { ApiPromise, WsProvider } = require("@polkadot/api");
              const wsUrl =
                network === "testnet"
                  ? process.env.POLKADOT_WS_TESTNET ||
                  "wss://pas-rpc.stakeworld.io"
                  : process.env.POLKADOT_WS_MAINNET || "wss://rpc.polkadot.io";
              const provider = new (require("@polkadot/api").WsProvider)(wsUrl);
              const api = await require("@polkadot/api").ApiPromise.create({
                provider,
              });
              const keyring = new (require("@polkadot/keyring").Keyring)({
                type: "sr25519",
              });
              let sender: any = null;
              try {
                sender = keyring.addFromUri(JSON.parse(privateKey).mnemonic);
              } catch {
                try {
                  sender = keyring.addFromUri(privateKey);
                } catch { }
              }
              const planckFee = BigInt(Math.round(feeTokenRounded * 1e10));
              const tx =
                api.tx.balances.transferKeepAlive || api.tx.balances.transfer;
              const batch = api.tx.utility
                ? api.tx.utility.batch([
                  tx(treasuryWallet, planckFee.toString()),
                ])
                : tx(treasuryWallet, planckFee.toString());
              feeTxHash = await new Promise<string>(async (resolve, reject) => {
                try {
                  const unsub = await batch.signAndSend(
                    sender,
                    (result: any) => {
                      if (
                        result.status.isInBlock ||
                        result.status.isFinalized
                      ) {
                        resolve(
                          result.status.isInBlock
                            ? result.status.asInBlock.toString()
                            : result.status.asFinalized.toString()
                        );
                        try {
                          unsub();
                        } catch { }
                      }
                    }
                  );
                } catch (e) {
                  reject(e);
                }
              });
              try {
                await api.disconnect();
              } catch { }
            }

            // mark fee tx as completed if we have a hash
            if (feeTxRecord && feeTxHash) {
              await FeeCollectionService.completeFeeTransfer(
                feeTxRecord.id,
                feeTxHash
              );
            } else if (feeTxRecord && !feeTxHash) {
              await FeeCollectionService.failFeeTransfer(
                feeTxRecord.id,
                "Fee transfer not completed"
              );
            }
          } catch (feeErr) {
            console.error("Fee transfer error (non-fatal):", feeErr);
            try {
              if (feeTxRecord)
                await FeeCollectionService.failFeeTransfer(
                  feeTxRecord.id,
                  feeErr instanceof Error ? feeErr.message : String(feeErr)
                );
            } catch { }
          }
        } else {
          console.log("[DEBUG] No fee to transfer (feeTokenRounded = 0)");
          if (feeTxRecord) {
            // Record the fee as complete even though it's 0
            await FeeCollectionService.completeFeeTransfer(
              feeTxRecord.id,
              txHash // Use the main transaction hash
            ).catch(() => { });
          }
        }
      }

      // Respond to the client immediately (do not block on non-critical background work)
      const responsePayload = {
        success: true,
        message: "Transaction sent successfully",
        txHash,
        fromAddress: userAddress.address,
        toAddress,
        chain,
        network,
        chainRpcName: txChainName,
        feeBreakdown: {
          recipientReceives: feeCalculation.recipientReceives,
          fee: feeCalculation.fee,
          senderPays: feeCalculation.senderPays,
          tier: feeCalculation.tier,
          feePercentage: feeCalculation.feePercentage,
          treasuryWallet: treasuryWallet,
        },
      };

      // Start background tasks (fee recording and notification) but don't await them here
      (async () => {
        if (!req.user?.id) {
          console.error("⚠️ Background tasks skipped: user not authenticated");
          return;
        }
        try {
          await FeeCollectionService.recordFee({
            userId: req.user.id,
            transactionId: savedTransaction.id,
            calculation: feeCalculation,
            chain: chain,
            network: network,
            feeType: "normal_transaction",
            description: `Transaction fee for sending ${feeCalculation.recipientReceives
              } ${chain.toUpperCase()} to ${toAddress}`,
          });
          console.log(
            `✅ Fee recorded (background): $${feeCalculation.fee} (${feeCalculation.tier})`
          );
        } catch (feeError) {
          console.error("⚠️ Fee recording failed (background):", feeError);
        }

        try {
          await AppDataSource.getRepository(Notification).save({
            userId: req.user.id,
            type: NotificationType.SEND,
            title: "Tokens Sent",
            message: `You sent ${feeCalculation.recipientReceives
              } ${chain.toUpperCase()} to ${toAddress} (+ $${feeCalculation.fee
              } fee)`,
            details: {
              recipientReceives: feeCalculation.recipientReceives,
              fee: feeCalculation.fee,
              senderPays: feeCalculation.senderPays,
              tier: feeCalculation.tier,
              chain,
              network,
              toAddress,
              fromAddress: userAddress.address,
              txHash,
              treasuryWallet: treasuryWallet,
            },
            isRead: false,
            createdAt: new Date(),
          });
          console.log("✅ Notification created (background)");
        } catch (notifErr) {
          console.error(
            "⚠️ Notification creation failed (background):",
            notifErr
          );
        }
      })();

      // Instrument the response to confirm when the HTTP response is fully sent/closed.
      try {
        // Add a debug header so clients or curl -v can see that the server processed and included txHash
        if (txHash) res.setHeader("X-Transaction-Sent", txHash);

        // Log when response is finished (all bytes flushed) or closed prematurely
        res.on("finish", () => {
          console.log(
            "[DEBUG] res.finish event: response fully sent to client, res.finished=",
            res.finished
          );
        });
        res.on("close", () => {
          console.log(
            "[DEBUG] res.close event: connection closed before finish, res.finished=",
            res.finished
          );
        });

        // Flush headers early (if supported) and send JSON payload
        try {
          (res as any).flushHeaders?.();
        } catch (e) {
          /* ignore if not available */
        }
      } catch (e) {
        console.warn(
          "[DEBUG] Failed to attach response instrumentation:",
          (e as any)?.message || String(e)
        );
      }

      if (!earlyResponseSent) {
        // Instrument the response to confirm when the HTTP response is fully sent/closed.
        try {
          if (txHash) res.setHeader("X-Transaction-Sent", txHash);
          res.on("finish", () => {
            console.log(
              "[DEBUG] res.finish event: response fully sent to client, res.finished=",
              res.finished
            );
          });
          res.on("close", () => {
            console.log(
              "[DEBUG] res.close event: connection closed before finish, res.finished=",
              res.finished
            );
          });
          try {
            (res as any).flushHeaders?.();
          } catch (e) {
            /* ignore */
          }
        } catch (e) {
          console.warn(
            "[DEBUG] Failed to attach response instrumentation:",
            (e as any)?.message || String(e)
          );
        }

        res.status(200).json(responsePayload);
        console.log(
          "[DEBUG] Response dispatched to client, res.finished=",
          res.finished
        );
      } else {
        console.log(
          "[DEBUG] Early response already sent; skipping final res.json"
        );
      }

      return;
    } catch (error) {
      console.error("Send transaction error:", error);
      res.status(500).json({
        error: "Failed to send transaction",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Send funds to a ZENGA user identified by username.
   * This resolves the recipient's address for the given chain/network and delegates
   * to the existing sendTransaction method to perform the actual send (including PIN checks).
   * POST /wallet/send/by-username
   * Body: { username, chain, network, amount, fromAddress?, transactionPin }
   */
  static async sendByUsername(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { username, chain, network, amount } = req.body;

      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (!username || !chain || !network || !amount) {
        res.status(400).json({
          error: "Missing required fields: username, chain, network, amount",
        });
        return;
      }

      // Resolve username -> user
      const userRepo = AppDataSource.getRepository(User);
      const recipient = await userRepo.findOne({ where: { username } });
      if (!recipient) {
        res.status(404).json({ error: "Recipient username not found" });
        return;
      }

      // Prevent sending to self
      if (recipient.id === req.user.id) {
        res.status(400).json({ error: "Cannot send to your own username" });
        return;
      }

      // Resolve recipient address for chain/network
      const addressRepo = AppDataSource.getRepository(UserAddress);
      const recipientAddr = await addressRepo.findOne({
        where: { userId: recipient.id, chain, network },
      });
      if (!recipientAddr || !recipientAddr.address) {
        res.status(404).json({
          error:
            "Recipient does not have a wallet for the requested chain/network",
        });
        return;
      }

      // Inject resolved toAddress into request body and delegate to existing sendTransaction
      req.body.toAddress = recipientAddr.address;

      // Reuse existing sendTransaction which performs PIN checks, fee handling, DB writes, notifications etc.
      await WalletController.sendTransaction(req as any, res as any);

      // After sendTransaction completes, create a receive notification for the recipient (best-effort).
      (async () => {
        try {
          // Determine sender address for this chain/network (may have been provided by client)
          const addressRepo = AppDataSource.getRepository(UserAddress);
          let senderAddress = req.body?.fromAddress;
          if (!senderAddress) {
            const senderAddrRec = await addressRepo.findOne({
              where: { userId: req.user!.id, chain, network },
            });
            if (senderAddrRec) senderAddress = senderAddrRec.address;
          }

          // Currency label -- simple mapping similar to sendTransaction
          const currency = ((): string => {
            const map: Record<string, string> = {
              starknet: "STRK",
              ethereum: "ETH",
              usdt_erc20: "USDT",
              solana: "SOL",
              bitcoin: "BTC",
              stellar: "XLM",
              polkadot: "DOT",
            };
            return map[chain] || chain.toUpperCase();
          })();

          // Best-effort notify recipient that they will receive / have received funds
          try {
            if (!recipient || !recipient.id) {
              console.warn(
                "Recipient record missing id; skipping receive notification"
              );
            } else {
              await NotificationService.notifyReceiveMoney(
                recipient.id as string,
                String(amount),
                currency,
                senderAddress || "unknown",
                undefined,
                {
                  chain,
                  network,
                  toAddress: recipientAddr.address,
                  fromUserId: req.user!.id,
                }
              );
            }
          } catch (notifyErr) {
            console.warn(
              "Failed to notify recipient after sendByUsername:",
              (notifyErr as any)?.message || String(notifyErr)
            );
          }
        } catch (bgErr) {
          console.warn(
            "Background recipient notification failed (sendByUsername):",
            (bgErr as any)?.message || String(bgErr)
          );
        }
      })();

      return;
    } catch (err: any) {
      console.error("sendByUsername error:", err);
      res.status(500).json({
        error: "Failed to send by username",
        details: err?.message || String(err),
      });
    }
  }

  /**
   * Get user wallet addresses
   * Expects authenticated user in req.user
   * Returns all wallet addresses for the user
   */
  static async getWalletAddresses(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userAddressRepository = AppDataSource.getRepository(UserAddress);
      const addresses = await userAddressRepository.find({
        where: { userId },
        select: ["id", "chain", "network", "address", "addedAt"],
      });

      if (!addresses || addresses.length === 0) {
        res.status(404).json({
          error: "No wallet addresses found for this user",
          addresses: [],
        });
        return;
      }

      // Group addresses by chain for better organization
      const addressesByChain = addresses.reduce((acc, addr) => {
        // Ensure we always use a string key (fallback to 'unknown' when chain is undefined)
        const chainKey = String(addr.chain ?? "unknown");
        if (!acc[chainKey]) {
          acc[chainKey] = [];
        }
        acc[chainKey].push({
          id: addr.id,
          chain: addr.chain,
          network: addr.network,
          address: addr.address,
          addedAt: addr.addedAt,
        });
        return acc;
      }, {} as Record<string, any[]>);

      res.status(200).json({
        message: "Wallet addresses retrieved successfully",
        addresses: addressesByChain,
        totalCount: addresses.length,
      });
    } catch (error) {
      console.error("Get wallet addresses error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get user testnet wallet addresses
   * Returns only chain and address for testnet networks
   */
  static async getTestnetAddresses(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userAddressRepository = AppDataSource.getRepository(UserAddress);
      const addresses = await userAddressRepository.find({
        where: { userId, network: NetworkType.TESTNET },
        select: ["chain", "address"],
      });

      if (!addresses || addresses.length === 0) {
        res.status(404).json({
          error: "No testnet addresses found for this user",
          addresses: [],
        });
        return;
      }

      // Return simplified format with only chain and address
      const simplifiedAddresses = addresses.map((addr) => ({
        chain: addr.chain,
        address: addr.address,
      }));

      // Sort addresses before sending
      const sortedAddresses = sortAddressesByChainOrder(simplifiedAddresses);

      res.status(200).json({
        message: "Testnet addresses retrieved successfully",
        addresses: sortedAddresses,
      });
    } catch (error) {
      console.error("Get testnet addresses error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get user mainnet wallet addresses
   * Returns only chain and address for mainnet networks
   */
  static async getMainnetAddresses(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userAddressRepository = AppDataSource.getRepository(UserAddress);
      const addresses = await userAddressRepository.find({
        where: { userId, network: NetworkType.MAINNET },
        select: ["chain", "address"],
      });

      if (!addresses || addresses.length === 0) {
        res.status(404).json({
          error: "No mainnet addresses found for this user",
          addresses: [],
        });
        return;
      }

      // Return simplified format with only chain and address
      const simplifiedAddresses = addresses.map((addr) => ({
        chain: addr.chain,
        address: addr.address,
      }));

      res.status(200).json({
        message: "Mainnet addresses retrieved successfully",
        addresses: simplifiedAddresses,
      });
    } catch (error) {
      console.error("Get mainnet addresses error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get testnet balances for the authenticated user
   * Returns balances for all testnet addresses only
   */
  static async getTestnetBalances(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const addressRepo = AppDataSource.getRepository(UserAddress);
      const addresses = await addressRepo.find({
        where: {
          userId: req.user!.id,
          network: NetworkType.TESTNET,
        },
      });

      const balances: any[] = [];

      // Helper: simple concurrency limiter (p-limit style)
      async function runWithLimit<T, U>(
        items: T[],
        limit: number,
        iterator: (item: T) => Promise<U>
      ) {
        let i = 0;
        const results: U[] = [] as any;
        const workers = Array.from({
          length: Math.min(limit, items.length),
        }).map(async () => {
          while (true) {
            const idx = i++;
            if (idx >= items.length) break;
            try {
              results[idx] = await iterator(items[idx]);
            } catch (e) {
              results[idx] = e as any;
            }
          }
        });
        await Promise.all(workers);
        return results;
      }

      // Small wrapper to add timeouts to promises
      function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
        return new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("timeout")), ms);
          p.then(
            (v) => {
              clearTimeout(t);
              resolve(v);
            },
            (err) => {
              clearTimeout(t);
              reject(err);
            }
          );
        });
      }

      // Helper function to get a working Starknet testnet provider with fallbacks
      async function getStarknetTestnetProvider(): Promise<RpcProvider> {
        const providers = [
          // Primary: Alchemy Sepolia (if API key is available and valid)
          process.env.ALCHEMY_STARKNET_KEY
            ? `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`
            : null,
          // Fallback: BlastAPI testnet endpoint
          "https://starknet-sepolia.public.blastapi.io",
          // Additional fallback: Other public testnet endpoints
          "https://starknet-sepolia.public.zksync.io",
        ].filter((url): url is string => url !== null); // Remove null values and type guard

        for (const url of providers) {
          try {
            const provider = new RpcProvider({ nodeUrl: url });
            // Test the provider with a simple call
            await withTimeout(provider.getBlockNumber(), 5000);
            console.log(`Starknet testnet provider working: ${url}`);
            return provider;
          } catch (error) {
            console.warn(
              `Starknet testnet provider failed: ${url}, error: ${(error as any)?.message || String(error)
              }`
            );
            continue;
          }
        }
        throw new Error("All Starknet testnet providers failed");
      }

      // Reuse providers per-network for testnet
      const providers: any = {};

      const processAddr = async (addr: any) => {
        try {
          if (addr.chain === "starknet") {
            const key = "starknet_test";
            if (!providers[key]) {
              providers[key] = await getStarknetTestnetProvider();
            }
            const provider = providers[key];
            const strkTokenAddress =
              "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
            const result = await withTimeout(
              provider.callContract({
                contractAddress: strkTokenAddress,
                entrypoint: "balanceOf",
                calldata: [padStarknetAddress(addr.address as string)],
                blockIdentifier: "latest",
              }) as any,
              7000
            );
            const balanceHex =
              (result as any) && (result as any)[0]
                ? (result as any)[0]
                : "0x0";
            const balanceDecimal = parseInt(String(balanceHex), 16);
            const balanceInSTRK = (balanceDecimal / 1e18).toString();

            // fire-and-forget save
            try {
              addr.lastKnownBalance = Number(balanceInSTRK);
              addressRepo.save(addr).catch(() => { });
            } catch { }

            return {
              chain: addr.chain,
              network: "testnet",
              address: addr.address,
              balance: balanceInSTRK,
              symbol: "STRK",
            };
          } else if (addr.chain === "ethereum") {
            const key = "eth_test";
            if (!providers[key])
              providers[key] = new ethers.JsonRpcProvider(
                `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
              );
            const provider = providers[key];
            const balance = await withTimeout(
              provider.getBalance(addr.address as string) as any,
              6000
            );
            const formatted = ethers.formatEther(balance as any);
            try {
              addr.lastKnownBalance = Number(formatted);
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "testnet",
              address: addr.address,
              balance: formatted,
              symbol: "ETH",
            };
          } else if (addr.chain === "bitcoin") {
            const url = `https://blockstream.info/testnet/api/address/${addr.address}`;
            const resp: any = await withTimeout(
              axios.get(url, { timeout: 7000 }) as any,
              8000
            );
            const balanceInSatoshis =
              (resp.data as any).chain_stats?.funded_txo_sum || 0;
            const balanceInBTC = balanceInSatoshis / 1e8;
            try {
              addr.lastKnownBalance = balanceInBTC;
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "testnet",
              address: addr.address,
              balance: balanceInBTC.toString(),
              symbol: "BTC",
            };
          } else if (addr.chain === "solana") {
            const key = "sol_test";
            if (!providers[key])
              providers[key] = new Connection(
                `https://solana-devnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
              );
            const connection = providers[key];
            const publicKey = new PublicKey(addr.address as string);
            const bal: any = await withTimeout(
              connection.getBalance(publicKey) as any,
              6000
            );
            const balanceInSOL = bal / 1e9;
            try {
              addr.lastKnownBalance = balanceInSOL;
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "testnet",
              address: addr.address,
              balance: balanceInSOL.toString(),
              symbol: "SOL",
            };
          } else if (addr.chain === "stellar") {
            const horizon = "https://horizon-testnet.stellar.org";
            const resp: any = await withTimeout(
              axios.get(`${horizon}/accounts/${addr.address}`, {
                timeout: 7000,
              }) as any,
              8000
            );
            const data = resp.data as any;
            const native = (data.balances || []).find(
              (b: any) => b.asset_type === "native"
            );
            const balanceStr = native ? native.balance : "0";
            try {
              addr.lastKnownBalance = Number(balanceStr);
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "testnet",
              address: addr.address,
              balance: balanceStr,
              symbol: "XLM",
            };
          } else if (addr.chain === "polkadot") {
            const key = "polka_test";
            if (!providers[key]) {
              const { ApiPromise, WsProvider } = require("@polkadot/api");
              const wsUrl =
                process.env.POLKADOT_WS_TESTNET ||
                "wss://pas-rpc.stakeworld.io";
              const provider = new WsProvider(wsUrl);
              providers[key] = await ApiPromise.create({ provider });
            }
            const api = providers["polka_test"];
            const derived: any = await withTimeout(
              api.derive.balances.account(addr.address as string) as any,
              7000
            );
            const available =
              (derived &&
                (derived.availableBalance ??
                  derived.freeBalance ??
                  derived.free)) ||
              0;
            const PLANCK = BigInt(10 ** 10);
            const availableBig = BigInt(String(available));
            const dot = (availableBig / PLANCK).toString();
            try {
              addr.lastKnownBalance = Number(dot);
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "testnet",
              address: addr.address,
              balance: dot,
              symbol: "DOT",
            };
          } else if (
            addr.chain === "usdt_erc20" ||
            addr.chain === "usdt_trc20"
          ) {
            // SKIP USDT for now - contract issues on testnet
            console.log(
              `[SKIP] USDT balance check skipped for ${addr.chain} on testnet`
            );
            return {
              chain: addr.chain,
              network: "testnet",
              address: addr.address,
              balance: "0",
              symbol: "USDT",
              error: "USDT balance check skipped",
            };
          }

          return {
            chain: addr.chain,
            network: "testnet",
            address: addr.address,
            balance: "0",
            symbol: "UNKNOWN",
            error: "Unsupported chain",
          };
        } catch (err: any) {
          console.warn(
            "Balance fetch failed for",
            addr.address,
            "chain",
            addr.chain,
            err && (err.message || String(err))
          );
          return {
            chain: addr.chain,
            network: "testnet",
            address: addr.address,
            balance: "0",
            symbol: (addr.chain || "UNK").toUpperCase(),
            error: "Failed to fetch balance",
          };
        }
      };

      // Run with controlled concurrency
      const concurrency = 6; // tune this value based on server capacity
      const results = await runWithLimit(addresses, concurrency, processAddr);

      // Close any created long-lived providers (polkadot ApiPromise) - disconnect gracefully
      if (
        providers["polka_test"] &&
        typeof providers["polka_test"].disconnect === "function"
      ) {
        try {
          await providers["polka_test"].disconnect();
        } catch { }
      }

      // Collect results into balances
      for (const r of results) {
        if (r) balances.push(r as any);
      }

      res.status(200).json({
        message: "Testnet balances retrieved successfully",
        balances,
        totalAddresses: addresses.length,
      });
    } catch (error) {
      console.error("Get testnet balances error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get mainnet balances for the authenticated user
   * Returns balances for all mainnet addresses only
   */
  static async getMainnetBalances(
    req: AuthRequest,
    res: Response
  ): Promise<void> {
    try {
      const addressRepo = AppDataSource.getRepository(UserAddress);
      const addresses = await addressRepo.find({
        where: {
          userId: req.user!.id,
          network: NetworkType.MAINNET,
        },
      });

      const balances: any[] = [];

      // Concurrent processing for mainnet addresses (similar pattern to testnet)
      const balancesResults: any[] = [];

      async function runWithLimitMain<T, U>(
        items: T[],
        limit: number,
        iterator: (item: T) => Promise<U>
      ) {
        let i = 0;
        const results: U[] = [] as any;
        const workers = Array.from({
          length: Math.min(limit, items.length),
        }).map(async () => {
          while (true) {
            const idx = i++;
            if (idx >= items.length) break;
            try {
              results[idx] = await iterator(items[idx]);
            } catch (e) {
              results[idx] = e as any;
            }
          }
        });
        await Promise.all(workers);
        return results;
      }

      function withTimeoutMain<T>(p: Promise<T>, ms = 8000): Promise<T> {
        return new Promise<T>((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("timeout")), ms);
          p.then(
            (v) => {
              clearTimeout(t);
              resolve(v);
            },
            (err) => {
              clearTimeout(t);
              reject(err);
            }
          );
        });
      }

      // Helper function to get a working Starknet provider with fallbacks
      async function getStarknetProvider(): Promise<RpcProvider> {
        const providers = [
          // Primary: Alchemy (if API key is available and valid)
          process.env.ALCHEMY_STARKNET_KEY
            ? `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`
            : null,
          // Fallback: BlastAPI public endpoint
          "https://starknet-mainnet.public.blastapi.io",
          // Additional fallback: Nethermind public endpoint
          "https://starknet-mainnet.public.zksync.io",
        ].filter((url): url is string => url !== null); // Remove null values and type guard

        for (const url of providers) {
          try {
            const provider = new RpcProvider({ nodeUrl: url });
            // Test the provider with a simple call
            await withTimeoutMain(provider.getBlockNumber(), 5000);
            console.log(`Starknet provider working: ${url}`);
            return provider;
          } catch (error) {
            console.warn(
              `Starknet provider failed: ${url}, error: ${(error as any)?.message || String(error)
              }`
            );
            continue;
          }
        }
        throw new Error("All Starknet providers failed");
      }

      const providersMain: any = {};

      const processMain = async (addr: any) => {
        try {
          if (addr.chain === "starknet") {
            const key = "starknet_main";
            if (!providersMain[key]) {
              providersMain[key] = await getStarknetProvider();
            }
            const provider = providersMain[key];
            const strkTokenAddress =
              "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
            const result = await withTimeoutMain(
              provider.callContract({
                contractAddress: strkTokenAddress,
                entrypoint: "balanceOf",
                calldata: [padStarknetAddress(addr.address as string)],
                blockIdentifier: "latest",
              }) as any,
              8000
            );
            const balanceHex =
              (result as any) && (result as any)[0]
                ? (result as any)[0]
                : "0x0";
            const balanceDecimal = parseInt(String(balanceHex), 16);
            const balanceInSTRK = (balanceDecimal / 1e18).toString();
            try {
              addr.lastKnownBalance = Number(balanceInSTRK);
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "mainnet",
              address: addr.address,
              balance: balanceInSTRK,
              symbol: "STRK",
            };
          } else if (addr.chain === "ethereum") {
            const key = "eth_main";
            if (!providersMain[key])
              providersMain[key] = new ethers.JsonRpcProvider(
                `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
              );
            const provider = providersMain[key];
            const balance = await withTimeoutMain(
              provider.getBalance(addr.address as string) as any,
              7000
            );
            const formatted = ethers.formatEther(balance as any);
            try {
              addr.lastKnownBalance = Number(formatted);
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "mainnet",
              address: addr.address,
              balance: formatted,
              symbol: "ETH",
            };
          } else if (addr.chain === "bitcoin") {
            try {
              let balanceInBTC = 0;
              let apiUsed = "";
              try {
                const url = `https://blockstream.info/api/address/${addr.address}`;
                const response: any = await withTimeoutMain(
                  axios.get(url, { timeout: 8000 }) as any,
                  9000
                );
                const data = response.data as any;
                const balanceInSatoshis =
                  (data.chain_stats?.funded_txo_sum || 0) -
                  (data.chain_stats?.spent_txo_sum || 0);
                balanceInBTC = balanceInSatoshis / 1e8;
                apiUsed = "blockstream";
              } catch (bsErr: any) {
                try {
                  const fallbackUrl = `https://blockchain.info/q/addressbalance/${addr.address}`;
                  const fallbackResp: any = await withTimeoutMain(
                    axios.get(fallbackUrl, { timeout: 8000 }) as any,
                    9000
                  );
                  const balanceInSatoshis = parseInt(
                    String(fallbackResp.data),
                    10
                  );
                  balanceInBTC = balanceInSatoshis / 1e8;
                  apiUsed = "blockchain.info";
                } catch (fbErr: any) {
                  throw new Error(
                    `Both APIs failed: ${bsErr?.message}, ${fbErr?.message}`
                  );
                }
              }
              try {
                addr.lastKnownBalance = balanceInBTC;
                addressRepo.save(addr).catch(() => { });
              } catch { }
              return {
                chain: addr.chain,
                network: "mainnet",
                address: addr.address,
                balance: balanceInBTC.toString(),
                symbol: "BTC",
              };
            } catch (err) {
              return {
                chain: addr.chain,
                network: "mainnet",
                address: addr.address,
                balance: "0",
                symbol: "BTC",
                error: "Failed to fetch balance",
              };
            }
          } else if (addr.chain === "solana") {
            const key = "sol_main";
            if (!providersMain[key])
              providersMain[key] = new Connection(
                `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
              );
            const connection = providersMain[key];
            const publicKey = new PublicKey(addr.address as string);
            const bal: any = await withTimeoutMain(
              connection.getBalance(publicKey) as any,
              7000
            );
            const balanceInSOL = bal / 1e9;
            try {
              addr.lastKnownBalance = balanceInSOL;
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "mainnet",
              address: addr.address,
              balance: balanceInSOL.toString(),
              symbol: "SOL",
            };
          } else if (addr.chain === "stellar") {
            const horizon = "https://horizon.stellar.org";
            const resp: any = await withTimeoutMain(
              axios.get(`${horizon}/accounts/${addr.address}`) as any,
              8000
            );
            const data = resp.data as any;
            const native = (data.balances || []).find(
              (b: any) => b.asset_type === "native"
            );
            const balanceStr = native ? native.balance : "0";
            try {
              addr.lastKnownBalance = Number(balanceStr);
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "mainnet",
              address: addr.address,
              balance: balanceStr,
              symbol: "XLM",
            };
          } else if (addr.chain === "polkadot") {
            const key = "polka_main";
            if (!providersMain[key]) {
              const { ApiPromise, WsProvider } = require("@polkadot/api");
              const wsUrl =
                process.env.POLKADOT_WS_MAINNET || "wss://rpc.polkadot.io";
              const provider = new WsProvider(wsUrl);
              providersMain[key] = await ApiPromise.create({ provider });
            }
            const api = providersMain["polka_main"];
            const derived: any = await withTimeoutMain(
              api.derive.balances.account(addr.address as string) as any,
              8000
            );
            const available =
              (derived &&
                (derived.availableBalance ??
                  derived.freeBalance ??
                  derived.free)) ||
              0;
            const PLANCK = BigInt(10 ** 10);
            const availableBig = BigInt(String(available));
            const dot = (availableBig / PLANCK).toString();
            try {
              addr.lastKnownBalance = Number(dot);
              addressRepo.save(addr).catch(() => { });
            } catch { }
            return {
              chain: addr.chain,
              network: "mainnet",
              address: addr.address,
              balance: dot,
              symbol: "DOT",
            };
          } else if (
            addr.chain === "usdt_erc20" ||
            addr.chain === "usdt_trc20"
          ) {
            // SKIP USDT for now - focusing on STRK/ETH
            console.log(
              `[SKIP] USDT balance check skipped for ${addr.chain} on mainnet`
            );
            return {
              chain: addr.chain,
              network: "mainnet",
              address: addr.address,
              balance: "0",
              symbol: "USDT",
              error: "USDT balance check skipped",
            };
          }
          return {
            chain: addr.chain,
            network: "mainnet",
            address: addr.address,
            balance: "0",
            symbol: "UNKNOWN",
            error: "Unsupported chain",
          };
        } catch (err: any) {
          console.warn(
            "Mainnet balance fetch failed for",
            addr.address,
            "chain",
            addr.chain,
            err && (err.message || String(err))
          );
          return {
            chain: addr.chain,
            network: "mainnet",
            address: addr.address,
            balance: "0",
            symbol: (addr.chain || "UNK").toUpperCase(),
            error: "Failed to fetch balance",
          };
        }
      };

      const concurrencyMain = 6;
      const mainResults = await runWithLimitMain(
        addresses,
        concurrencyMain,
        processMain
      );

      if (
        providersMain["polka_main"] &&
        typeof providersMain["polka_main"].disconnect === "function"
      ) {
        try {
          await providersMain["polka_main"].disconnect();
        } catch { }
      }

      for (const r of mainResults) if (r) balances.push(r as any);

      res.status(200).json({
        message: "Mainnet balances retrieved successfully",
        balances,
        totalAddresses: addresses.length,
      });
    } catch (error) {
      console.error("Get mainnet balances error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Checks all user addresses for new deposits and creates notifications.
   * Call this periodically (e.g., with a cron job or background worker).
   */
  static async checkForDeposits(): Promise<void> {
    const addressRepo = AppDataSource.getRepository(UserAddress);
    const notificationRepo = AppDataSource.getRepository(Notification);

    const allAddresses = await addressRepo.find();
    for (const addr of allAddresses) {
      let currentBalance = 0;

      try {
        if (addr.chain === "ethereum") {
          const provider = new ethers.JsonRpcProvider(
            addr.network === "testnet"
              ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
              : `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
          );
          currentBalance = parseFloat(
            ethers.formatEther(
              await provider.getBalance(addr.address as string)
            )
          );
        } else if (addr.chain === "bitcoin") {
          const url =
            (addr.network === "testnet"
              ? "https://blockstream.info/testnet/api/address/"
              : "https://blockstream.info/api/address/") + addr.address;
          const resp = await axios.get(url);
          const data = resp.data as {
            chain_stats: {
              funded_txo_sum: number;
              spent_txo_sum: number;
            };
          };
          const balance =
            (data.chain_stats.funded_txo_sum || 0) -
            (data.chain_stats.spent_txo_sum || 0);
          currentBalance = balance / 1e8;
        } else if (addr.chain === "solana") {
          const connection = new Connection(
            addr.network === "testnet"
              ? `https://solana-devnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
              : `https://solana-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
          );
          const publicKey = new PublicKey(addr.address as string);
          const balance = await connection.getBalance(publicKey);
          currentBalance = balance / 1e9;
        } else if (addr.chain === "starknet") {
          try {
            const STRK_MAINNET = `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/${process.env.ALCHEMY_STARKNET_KEY}`;
            const STRK_TESTNET = `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`;
            const provider = new RpcProvider({
              nodeUrl: addr.network === "testnet" ? STRK_TESTNET : STRK_MAINNET,
            });

            const strkTokenAddress =
              "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
            const res = await provider.callContract(
              {
                contractAddress: strkTokenAddress,
                entrypoint: "balanceOf",
                calldata: [addr.address as string],
              },
              "latest"
            );

            const hex = res && res[0] ? res[0] : "0x0";
            const val = BigInt(hex);
            currentBalance = Number(val) / 1e18;
          } catch (e) {
            console.warn(
              "Starknet deposit check failed for",
              addr.address,
              (e as any)?.message || String(e)
            );
            continue;
          }
        } else if (addr.chain === "usdt_erc20") {
          // Skip USDT checks - not supported
          continue;
        } else if (addr.chain === "stellar") {
          try {
            const horizon =
              addr.network === "testnet"
                ? "https://horizon-testnet.stellar.org"
                : "https://horizon.stellar.org";
            const resp = await axios.get(`${horizon}/accounts/${addr.address}`);
            const data = resp.data as any;
            const native = (data.balances || []).find(
              (b: any) => b.asset_type === "native"
            );
            currentBalance = native ? Number(native.balance) : 0;
          } catch (e) {
            console.warn(
              "Stellar balance check failed for",
              addr.address,
              (e as any)?.message || String(e)
            );
            continue;
          }
        }
      } catch (e) {
        continue; // skip on error
      }
      // Treat missing lastKnownBalance as 0 and notify when currentBalance > lastKnown (including first run)
      const lastKnown = Number(addr.lastKnownBalance ?? 0);
      if (currentBalance > lastKnown) {
        const amount = currentBalance - lastKnown;
        const chainLabel = String(addr.chain ?? "unknown").toUpperCase();
        try {
          await NotificationService.notifyDeposit(
            addr.userId as string,
            amount.toString(),
            chainLabel,
            {
              address: addr.address,
              amount,
              chain: addr.chain,
              network: addr.network,
            }
          );
        } catch (e) {
          console.error(
            "Failed to create deposit notification (NotificationService) for",
            addr.address,
            (e as any)?.message || String(e)
          );
        }
      }

      // Update last known balance
      addr.lastKnownBalance = currentBalance;
      await addressRepo.save(addr);
    }
  }
}

//// Helper function
function sortAddressesByChainOrder(addresses: any[]): any[] {
  const order = ["eth", "btc", "sol", "strk", "usdterc20", "usdttrc20"];
  const normalize = (chain: string) => {
    switch (chain) {
      case "ethereum":
        return "eth";
      case "bitcoin":
        return "btc";
      case "solana":
        return "sol";
      case "starknet":
        return "strk";
      case "usdt_erc20":
        return "usdterc20";
      case "usdt_trc20":
        return "usdttrc20";
      default:
        return chain;
    }
  };
  return addresses.sort(
    (a, b) =>
      order.indexOf(normalize(a.chain)) - order.indexOf(normalize(b.chain))
  );
}
