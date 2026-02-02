import { Request, Response } from "express";
import { AuthRequest } from "../types";
import { AppDataSource } from "../config/database";
import { SplitPayment, SplitPaymentStatus } from "../entities/SplitPayment";
import { SplitPaymentRecipient } from "../entities/SplitPaymentRecipient";
import {
  SplitPaymentExecution,
  ExecutionStatus,
} from "../entities/SplitPaymentExecution";
import {
  SplitPaymentExecutionResult,
  PaymentResultStatus,
} from "../entities/SplitPaymentExecutionResult";
import { UserAddress } from "../entities/UserAddress";
import { User } from "../entities/User";
import { Notification } from "../entities/Notification";
import { NotificationType } from "../types/index";
import { ethers } from "ethers";
import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction as SolTx,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { ECPairFactory } from "ecpair";
import * as ecc from "tiny-secp256k1";
import { ChainType, NetworkType } from "../types";
import * as bitcoin from "bitcoinjs-lib";
import axios from "axios";
import * as starknet from "starknet";
import { FeeService } from "../services/feeService";
import FeeCollectionService from "../services/feeCollectionService";
import { PriceFeedService } from "../services/priceFeedService";
import TreasuryConfig from "../config/treasury";
import bcrypt from "bcryptjs";

const ECPair = ECPairFactory(ecc);

// Token definitions for Starknet
const STARKNET_TOKENS: Record<string, Record<string, Record<string, any>>> = {
  mainnet: {
    strk: {
      address:
        "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f632c0dbb1",
      decimals: 18,
    },
    eth: {
      address:
        "0x049d36570d4e46f48e99674bd3fcc84644dff0fcd51e1401197edf75935258d7e",
      decimals: 18,
    },
    usdc: {
      address:
        "0x053c91253bc9682c04929ca02ed00b130b7516e012e0dda72b526995fb20ba91d",
      decimals: 6,
    },
    usdt: {
      address:
        "0x068f5c6a61780768455de69077e07e89787eaf8a6c72c092d5370d29a7a00d6e",
      decimals: 6,
    },
    dai: {
      address:
        "0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3",
      decimals: 18,
    },
  },
  testnet: {
    strk: {
      address:
        "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f632c0dbb1",
      decimals: 18,
    },
    eth: {
      address:
        "0x049d36570d4e46f48e99674bd3fcc84644dff0fcd51e1401197edf75935258d7e",
      decimals: 18,
    },
    usdc: {
      address:
        "0x053c91253bc9682c04929ca02ed00b130b7516e012e0dda72b526995fb20ba91d",
      decimals: 6,
    },
    usdt: {
      address:
        "0x068f5c6a61780768455de69077e07e89787eaf8a6c72c092d5370d29a7a00d6e",
      decimals: 6,
    },
  },
};

// Multiple RPC endpoints for fallback - use v0_7 for better compatibility
// const RPC_ENDPOINTS = {
//     mainnet: [

//         'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/CP1fRkzqgL_nwb9DNNiKI',
//     ],
//     testnet: [

//         'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_9/CP1fRkzqgL_nwb9DNNiKI',
//     ],
// };
const RPC_ENDPOINTS = {
  mainnet: [
    // Order by library compatibility first, then features
    "https://starknet-mainnet.public.blastapi.io/rpc/v0_8",
    "https://starknet-mainnet.public.blastapi.io/rpc/v0_7",
    "https://starknet-mainnet.public.blastapi.io/rpc/v0_9",
    "https://free-rpc.nethermind.io/mainnet-juno",
  ],
  testnet: [
    "https://starknet-sepolia.public.blastapi.io/rpc/v0_8",
    "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
    "https://starknet-sepolia.public.blastapi.io/rpc/v0_9",
    "https://free-rpc.nethermind.io/sepolia-juno",
  ],
};

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    state_mutability: "external",
    inputs: [
      {
        name: "recipient",
        type: "core::starknet::contract_address::ContractAddress",
      },
      {
        name: "amount",
        type: "core::integer::u256",
      },
    ],
    outputs: [{ type: "core::bool" }],
  },
];

interface TokenConfig {
  address: string;
  decimals: number;
}

function getTokenConfig(
  network: string,
  tokenSymbol: string,
): TokenConfig | null {
  const normalizedNetwork = network === "testnet" ? "testnet" : "mainnet";
  const normalizedSymbol = tokenSymbol.toLowerCase();
  return (
    (STARKNET_TOKENS[normalizedNetwork]?.[normalizedSymbol] as TokenConfig) ||
    null
  );
}

function normalizeStarknetAddress(address: string): string {
  if (!address) {
    throw new Error("Address cannot be empty");
  }

  let addr = address.startsWith("0x") ? address.slice(2) : address;
  addr = addr.trim();

  if (!/^[0-9a-fA-F]+$/.test(addr)) {
    throw new Error(
      `Invalid Starknet address format: contains non-hex characters`,
    );
  }

  // Pad with leading zeros to 64 characters (66 total with 0x)
  addr = addr.padStart(64, "0");
  return "0x" + addr;
}

// RPC Endpoints - use v0_7 for better compatibility
// (Removed duplicate declaration of RPC_ENDPOINTS)

async function getWorkingProvider(
  network: string,
): Promise<starknet.RpcProvider> {
  const isTestnet = network === "testnet";
  const envOverride = isTestnet
    ? process.env.STARKNET_SEPOLIA_RPC
    : process.env.STARKNET_MAINNET_RPC;
  const endpoints = [
    ...(envOverride ? [envOverride] : []),
    ...(isTestnet ? RPC_ENDPOINTS.testnet : RPC_ENDPOINTS.mainnet),
  ];

  for (const endpoint of endpoints) {
    try {
      const provider = new starknet.RpcProvider({ nodeUrl: endpoint });
      // Basic connectivity
      await provider.getChainId();
      // Light capability probe to weed out incompatible specs
      try {
        await provider.getBlockNumber();
        await provider.getBlockWithTxHashes("latest");
      } catch (capErr) {
        const msg = (capErr as any)?.message || String(capErr);
        if (/not supported by this library|RPC0\d\d/.test(msg)) {
          console.warn(
            `⚠️ Skipping incompatible RPC (spec): ${endpoint} -> ${msg}`,
          );
          continue;
        }
      }
      console.log(`✅ Connected to Starknet RPC: ${endpoint}`);
      return provider;
    } catch (err) {
      console.warn(
        `⚠️ Failed to connect to ${endpoint}:`,
        (err as any)?.message,
      );
      continue;
    }
  }

  throw new Error(
    `Failed to connect to any Starknet ${isTestnet ? "testnet" : "mainnet"} RPC endpoints`,
  );
}

// Helper to load Starknet SDK with lazy loading
let StarknetSdk: any = null;

function getStarknetSdk(): any {
  if (StarknetSdk) {
    return StarknetSdk;
  }

  try {
    StarknetSdk = require("starknet");
    console.log("✅ Starknet SDK loaded");
    return StarknetSdk;
  } catch (e) {
    console.warn(
      "⚠️ Starknet SDK not installed. Install with: npm install starknet",
    );
    return null;
  }
}

let StellarSdk: any = null;
// Try to load at startup (both package names supported). If not available we'll lazy-load later.
try {
  StellarSdk = require("@stellar/stellar-sdk");
  console.log("✅ Stellar SDK loaded at startup: @stellar/stellar-sdk");
} catch (e1) {
  try {
    StellarSdk = require("stellar-sdk");
    console.log("✅ Stellar SDK loaded at startup: stellar-sdk (legacy)");
  } catch (e2) {
    console.warn(
      "⚠️ Stellar SDK not found at startup. Will attempt lazy loading during payment execution.",
    );
  }
}

// Helper function to get Stellar SDK with lazy loading
function getStellarSdk(): any {
  if (StellarSdk) {
    return StellarSdk;
  }

  // Try lazy loading
  try {
    StellarSdk = require("@stellar/stellar-sdk");
    console.log("✅ Stellar SDK lazy loaded: @stellar/stellar-sdk");
    return StellarSdk;
  } catch (e1) {
    try {
      StellarSdk = require("stellar-sdk");
      console.log("✅ Stellar SDK lazy loaded: stellar-sdk (legacy)");
      return StellarSdk;
    } catch (e2) {
      return null;
    }
  }
}

export class SplitPaymentController {
  /**
   * Create a new reusable split payment template
   * POST /split-payment/create
   */

  static async createSplitPayment(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { title, description, chain, network, fromAddress, recipients } =
        req.body;

      // Validation
      if (!title || !chain || !network || !fromAddress || !recipients) {
        res.status(400).json({
          error:
            "Missing required fields: title, chain, network, fromAddress, recipients",
        });
        return;
      }

      if (!Array.isArray(recipients) || recipients.length === 0) {
        res.status(400).json({ error: "Recipients must be a non-empty array" });
        return;
      }

      if (recipients.length > 1000) {
        res
          .status(400)
          .json({ error: "Maximum 1000 recipients allowed per split" });
        return;
      }

      // Resolve usernames (if provided) and validate each recipient
      const userRepo = AppDataSource.getRepository(User);
      for (const recipient of recipients) {
        // amount required
        if (!recipient.amount) {
          res.status(400).json({ error: "Each recipient must have amount" });
          return;
        }

        // If address not provided but username is, attempt resolution
        if (!recipient.address && recipient.username) {
          const targetUser = await userRepo.findOne({
            where: { username: recipient.username },
            relations: ["addresses"],
          });
          if (!targetUser) {
            res
              .status(404)
              .json({ error: `Username not found: ${recipient.username}` });
            return;
          }

          const matchedAddresses = (targetUser.addresses || []).filter((a) => {
            return (
              String(a.chain) === String(chain) &&
              String(a.network) === String(network) &&
              a.address
            );
          });

          if (!matchedAddresses || matchedAddresses.length === 0) {
            res
              .status(404)
              .json({
                error: `Username ${recipient.username} has no address on ${chain}/${network}`,
              });
            return;
          }

          if (matchedAddresses.length > 1) {
            res.status(409).json({
              error: `Multiple addresses found for username ${recipient.username} on ${chain}/${network}`,
              addresses: matchedAddresses.map((a) => ({
                id: a.id,
                address: a.address,
              })),
            });
            return;
          }

          // set resolved address on recipient for downstream processing
          recipient.address = matchedAddresses[0]!.address;
        }

        // After possible resolution, ensure address exists
        if (!recipient.address) {
          res
            .status(400)
            .json({
              error: "Each recipient must have address or username and amount",
            });
          return;
        }

        if (Number(recipient.amount) <= 0) {
          res.status(400).json({ error: "All amounts must be positive" });
          return;
        }
      }

      // Normalize addresses for Starknet
      const isStarknetChain =
        chain === "starknet" ||
        chain === "strk" ||
        chain.startsWith("starknet_");

      let normalizedFromAddress = fromAddress;
      if (isStarknetChain) {
        try {
          normalizedFromAddress = normalizeStarknetAddress(fromAddress);
          console.log("Normalized fromAddress:", normalizedFromAddress);
        } catch (normErr) {
          res.status(400).json({
            error: `Invalid Starknet address format: ${fromAddress}`,
            details:
              normErr instanceof Error ? normErr.message : String(normErr),
          });
          return;
        }
      }

      // Verify user owns the address
      const userAddressRepo = AppDataSource.getRepository(UserAddress);

      let userAddress = await userAddressRepo.findOne({
        where: {
          userId: req.user!.id!,
          address: normalizedFromAddress,
          chain: chain as ChainType,
          network: network as NetworkType,
        },
      });

      // Fallback: try original address
      if (!userAddress && isStarknetChain) {
        userAddress = await userAddressRepo.findOne({
          where: {
            userId: req.user!.id!,
            address: fromAddress,
            chain: chain as ChainType,
            network: network as NetworkType,
          },
        });
      }

      if (!userAddress) {
        res.status(404).json({
          error: "Sender address not found in your wallet",
          details: `Checked: ${normalizedFromAddress}${isStarknetChain ? ` and ${fromAddress}` : ""}`,
        });
        return;
      }

      // Normalize recipient addresses for Starknet
      const normalizedRecipients = isStarknetChain
        ? recipients.map((recipient) => {
          try {
            return {
              ...recipient,
              address: normalizeStarknetAddress(recipient.address),
            };
          } catch (err) {
            console.warn(
              `Could not normalize recipient address ${recipient.address}:`,
              err,
            );
            return recipient;
          }
        })
        : recipients;

      // Calculate total amount
      const totalAmount = normalizedRecipients.reduce(
        (sum, r) => sum + Number(r.amount),
        0,
      );

      // Create split payment template
      const splitPaymentRepo = AppDataSource.getRepository(SplitPayment);
      const splitPayment = splitPaymentRepo.create({
        userId: req.user!.id!,
        title,
        description,
        chain,
        network,
        currency: getCurrencyFromChain(chain),
        fromAddress: normalizedFromAddress,
        totalAmount: totalAmount.toString(),
        totalRecipients: normalizedRecipients.length,
        status: SplitPaymentStatus.ACTIVE,
      });

      const savedSplitPayment = await splitPaymentRepo.save(splitPayment);

      // Create recipient records
      const recipientRepo = AppDataSource.getRepository(SplitPaymentRecipient);
      const recipientRecords = normalizedRecipients.map((recipient: any) =>
        recipientRepo.create({
          splitPaymentId: savedSplitPayment.id,
          recipientAddress: recipient.address,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          amount: recipient.amount.toString(),
          isActive: true,
        }),
      );

      await recipientRepo.save(recipientRecords);

      // Create notification
      const notificationRepo = AppDataSource.getRepository(Notification);
      await notificationRepo.save({
        userId: req.user!.id!,
        type: NotificationType.SEND,
        title: "Split Payment Created",
        message: `Split payment "${title}" created with ${normalizedRecipients.length} recipients`,
        details: {
          splitPaymentId: savedSplitPayment.id,
          title: savedSplitPayment.title,
          totalAmount: savedSplitPayment.totalAmount,
          totalRecipients: savedSplitPayment.totalRecipients,
          chain: savedSplitPayment.chain,
          network: savedSplitPayment.network,
          action: "created",
        },
        isRead: false,
        createdAt: new Date(),
      });

      res.status(201).json({
        message: "Split payment template created successfully",
        splitPayment: {
          id: savedSplitPayment.id,
          title: savedSplitPayment.title,
          description: savedSplitPayment.description,
          totalAmount: savedSplitPayment.totalAmount,
          totalRecipients: savedSplitPayment.totalRecipients,
          chain: savedSplitPayment.chain,
          network: savedSplitPayment.network,
          fromAddress: savedSplitPayment.fromAddress,
          status: savedSplitPayment.status,
          executionCount: 0,
          createdAt: savedSplitPayment.createdAt,
        },
        recipients: recipientRecords.map((r) => ({
          address: r.recipientAddress,
          name: r.recipientName,
          amount: r.amount,
        })),
      });
    } catch (error) {
      console.error("Create split payment error:", error);
      res.status(500).json({
        error: "Failed to create split payment",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // EXECUTE SPLIT PAYMENT
  static async executeSplitPayment(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: "Missing split payment ID" });
        return;
      }

      const paymentId = typeof id === "string" ? id : id[0];

      const splitPaymentRepo = AppDataSource.getRepository(SplitPayment);
      const splitPayment = await splitPaymentRepo.findOne({
        where: { id: paymentId as string, userId: req.user!.id! },
        relations: ["recipients"],
      });

      if (!splitPayment) {
        res.status(404).json({ error: "Split payment not found" });
        return;
      }

      if (splitPayment.status !== SplitPaymentStatus.ACTIVE) {
        res.status(400).json({
          error: `Split payment is ${splitPayment.status} and cannot be executed`,
        });
        return;
      }

      const activeRecipients = (splitPayment.recipients || []).filter(
        (r) => r.isActive,
      );
      if (activeRecipients.length === 0) {
        res.status(400).json({ error: "No active recipients found" });
        return;
      }

      // Create execution record
      const executionRepo = AppDataSource.getRepository(SplitPaymentExecution);
      const execution = executionRepo.create({
        splitPaymentId: splitPayment.id,
        totalAmount: splitPayment.totalAmount,
        totalRecipients: activeRecipients.length,
        status: ExecutionStatus.PROCESSING,
      });

      const savedExecution = await executionRepo.save(execution);

      // TODO: Re-enable transaction PIN verification when needed
      // Verify transaction PIN
      // const skipPin = process.env.SKIP_TRANSACTION_PIN === 'true';
      // if (!skipPin) {
      //     const providedPin = String(req.body?.transactionPin ?? req.body?.pin ?? '');
      //     if (!providedPin) {
      //         res.status(400).json({ error: 'Missing transactionPin in request body' });
      //         return;
      //     }

      //     const userRepo = AppDataSource.getRepository('users');
      //     const userRecord: any = await userRepo.findOne({ where: { id: req.user!.id } });
      //
      //     if (!userRecord?.transactionPin) {
      //         res.status(400).json({ error: 'Transaction PIN not set' });
      //         return;
      //     }

      //     const pinMatches = await bcrypt.compare(providedPin, userRecord.transactionPin);
      //     if (!pinMatches) {
      //         res.status(403).json({ error: 'Invalid transaction PIN' });
      //         return;
      //     }
      // }

      // Get user's private key
      const userAddressRepo = AppDataSource.getRepository(UserAddress);
      const isStarknetChain =
        splitPayment.chain === "starknet" ||
        splitPayment.chain === "strk" ||
        splitPayment.chain.startsWith("starknet_");

      let userAddress = await userAddressRepo.findOne({
        where: {
          userId: req.user!.id!,
          address: splitPayment.fromAddress,
          chain: splitPayment.chain as ChainType,
          network: splitPayment.network as NetworkType,
        },
      });

      // Fallback for Starknet: try short format
      if (!userAddress && isStarknetChain) {
        const shortAddr = splitPayment.fromAddress.replace(/^0x0+/, "0x");
        userAddress = await userAddressRepo.findOne({
          where: {
            userId: req.user!.id!,
            address: shortAddr,
            chain: splitPayment.chain as ChainType,
            network: splitPayment.network as NetworkType,
          },
        });
      }

      if (!userAddress?.encryptedPrivateKey) {
        throw new Error(
          `Private key not found for address: ${splitPayment.fromAddress}`,
        );
      }

      const { decrypt } = require("../utils/keygen");
      const privateKey = decrypt(userAddress.encryptedPrivateKey);

      // ===== STEP 1: Calculate fees for all recipients =====
      const recipientAmounts = activeRecipients.map((r) =>
        parseFloat(r.amount),
      );
      const feeCalculations = FeeService.calculateBatchFees(recipientAmounts);
      const totalFees = feeCalculations.reduce(
        (sum, calc) => sum + calc.fee,
        0,
      );
      const totalPaymentAmount = parseFloat(splitPayment.totalAmount as any);
      const totalAmountWithFees = totalPaymentAmount + totalFees;

      console.log(
        `Split payment fee breakdown:
- Total payment amount: $${totalPaymentAmount.toFixed(2)}
- Total fees: $${totalFees.toFixed(2)}
- Sender pays total: $${totalAmountWithFees.toFixed(2)}
- Recipients: ${activeRecipients.length}
- Fee calculations:`,
        feeCalculations.map((calc, idx) => ({
          recipient: activeRecipients[idx]!.recipientAddress,
          amount: calc.recipientReceives,
          fee: calc.fee,
          tier: calc.tier,
        })),
      );

      // ===== STEP 2: Get treasury wallet =====
      const treasuryWallet = TreasuryConfig.getTreasuryWallet(
        splitPayment.chain as ChainType,
        splitPayment.network as NetworkType,
      );

      if (!treasuryWallet) {
        throw new Error(
          `Treasury wallet not configured for ${splitPayment.chain} on ${splitPayment.network}`,
        );
      }

      console.log(
        `Treasury wallet for ${splitPayment.chain}/${splitPayment.network}: ${treasuryWallet}`,
      );

      // ===== STEP 3: Validate sender balance (placeholder - implement actual check) =====
      // TODO: Implement actual blockchain balance check
      // For now, we assume the balance is sufficient
      console.log(
        `[PLACEHOLDER] Validating sender has $${totalAmountWithFees.toFixed(2)} available...`,
      );

      // Process payments
      let results: Array<{ success: boolean; txHash?: string; error?: string }>;

      if (
        splitPayment.chain === "ethereum" ||
        splitPayment.chain === "usdt_erc20"
      ) {
        results = await SplitPaymentController.processEthereumBatch(
          splitPayment,
          activeRecipients,
          privateKey,
        );
      } else if (splitPayment.chain === "bitcoin") {
        results = await SplitPaymentController.processBitcoinBatch(
          splitPayment,
          activeRecipients,
          privateKey,
        );
      } else if (splitPayment.chain === "solana") {
        results = await SplitPaymentController.processSolanaBatch(
          splitPayment,
          activeRecipients,
          privateKey,
        );
      } else if (splitPayment.chain === "stellar") {
        results = await SplitPaymentController.processStellarBatch(
          splitPayment,
          activeRecipients,
          privateKey,
        );
      } else if (splitPayment.chain === "polkadot") {
        results = await SplitPaymentController.processPolkadotBatch(
          splitPayment,
          activeRecipients,
          privateKey,
        );
      } else if (isStarknetChain) {
        results = await SplitPaymentController.processStarknetBatch(
          splitPayment,
          activeRecipients,
          privateKey,
        );
      } else {
        throw new Error(
          `Chain ${splitPayment.chain} not supported for split payments`,
        );
      }

      // Update execution status
      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      savedExecution.successfulPayments = successCount;
      savedExecution.failedPayments = failedCount;
      savedExecution.completedAt = new Date();
      savedExecution.status =
        failedCount === 0
          ? ExecutionStatus.COMPLETED
          : successCount > 0
            ? ExecutionStatus.PARTIALLY_FAILED
            : ExecutionStatus.FAILED;

      await executionRepo.save(savedExecution);

      // Save results
      const resultRepo = AppDataSource.getRepository(
        SplitPaymentExecutionResult,
      );
      for (let i = 0; i < results.length; i++) {
        await resultRepo.save({
          executionId: savedExecution.id,
          recipientAddress: activeRecipients[i]!.recipientAddress,
          recipientName: activeRecipients[i]!.recipientName ?? null,
          recipientEmail: activeRecipients[i]!.recipientEmail ?? null,
          amount: activeRecipients[i]!.amount,
          status: results[i]!.success
            ? PaymentResultStatus.SUCCESS
            : PaymentResultStatus.FAILED,
          txHash: results[i]!.txHash ?? null,
          errorMessage: results[i]!.error ?? null,
          processedAt: new Date(),
        });
      }

      // Update split payment
      splitPayment.executionCount += 1;
      splitPayment.lastExecutedAt = new Date();
      await splitPaymentRepo.save(splitPayment);

      // ===== STEP 4: Execute fee collection (only if there were successful payments) =====
      let feeTxHash: string | undefined;
      const feeRecords: any[] = [];

      if (successCount > 0) {
        try {
          console.log(
            `Executing fee collection: $${totalFees.toFixed(2)} to treasury...`,
          );

          // TODO: Replace with actual blockchain transaction to treasury
          // For now, use placeholder transaction hash
          feeTxHash = `0xfee_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          console.log(`[PLACEHOLDER] Fee collection transaction: ${feeTxHash}`);

          // ===== STEP 5: Record fees in database for each successful payment =====
          for (let i = 0; i < results.length; i++) {
            if (results[i]!.success) {
              // Create a Transaction record for this fee transfer first so the
              // Fee record can reference it (DB enforces FK to transactions.id).
              const feeTx = await FeeCollectionService.createFeeTransferRecord({
                userId: req.user!.id as string,
                feeAmount: feeCalculations[i]!.fee.toString(),
                chain: splitPayment.chain,
                network: splitPayment.network,
                fromAddress: splitPayment.fromAddress,
                treasuryAddress: treasuryWallet,
                originalTxId: results[i]!.txHash!,
              });

              const calculationWithOnchain = {
                ...feeCalculations[i]!,
                onchainTxHash: results[i]!.txHash,
              };

              const feeRecord = await FeeCollectionService.recordFee({
                userId: req.user!.id as string,
                // Reference the transaction created above
                transactionId: feeTx.id,
                calculation: calculationWithOnchain,
                chain: splitPayment.chain,
                network: splitPayment.network,
                feeType: "split_payment",
                description: `Split payment fee for ${splitPayment.title} - Recipient: ${activeRecipients[i]!.recipientAddress}`,
              });

              // Launch a background fee transfer to treasury for supported chains.
              // We do this asynchronously so the HTTP response is not blocked.
              (async () => {
                try {
                  const chain = splitPayment.chain;

                  // Helper: convert USD fee -> token units (BigInt) for a given token
                  const convertUsdToTokenUnits = async (
                    tokenSym: string,
                    decimals: number,
                    usdAmount: number,
                  ) => {
                    const price = await PriceFeedService.getPrice(
                      tokenSym.toUpperCase(),
                    );
                    if (!price || price <= 0)
                      throw new Error("Invalid price for token conversion");
                    const tokensFloat = usdAmount / price;
                    const units = BigInt(
                      Math.floor(tokensFloat * Math.pow(10, decimals)),
                    );
                    return { tokensFloat, units };
                  };

                  // ETH / EVM chains (native ETH) and USDT (ERC20)
                  if (
                    chain === "ethereum" ||
                    chain === "usdt_erc20" ||
                    chain === "usdt_trc20" ||
                    chain === "usdt_bep20"
                  ) {
                    try {
                      const isUSDT = chain !== "ethereum";
                      const providerUrl =
                        splitPayment.network === "testnet"
                          ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
                          : `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`;
                      const {
                        JsonRpcProvider,
                        Wallet: EthersWallet,
                        Contract,
                      } = require("ethers");
                      const provider = new (require("ethers").JsonRpcProvider)(
                        providerUrl,
                      );
                      const wallet = new (require("ethers").Wallet)(
                        privateKey,
                        provider,
                      );

                      if (isUSDT) {
                        const usdtAddress =
                          splitPayment.network === "testnet"
                            ? "0x516de3a7a567d81737e3a46ec4ff9cfd1fcb0136"
                            : "0xdAC17F958D2ee523a2206206994597C13D831ec7";
                        const decimals = 6;
                        const { tokensFloat, units } =
                          await convertUsdToTokenUnits(
                            "USDT",
                            decimals,
                            feeCalculations[i]!.fee,
                          );
                        const usdtAbi = [
                          "function transfer(address to, uint256 value) public returns (bool)",
                        ];
                        const usdtContract = new ethers.Contract(
                          usdtAddress,
                          usdtAbi,
                          wallet,
                        );
                        const tx = await usdtContract.transfer!(
                          treasuryWallet,
                          units.toString(),
                        );
                        await tx.wait?.();
                        await FeeCollectionService.completeFeeTransfer(
                          feeTx.id,
                          tx.hash,
                        );
                        console.log(
                          "[FeeTransfer][EVM][USDT] Completed fee transfer:",
                          tx.hash,
                        );
                      } else {
                        // Native ETH
                        const { tokensFloat, units } =
                          await convertUsdToTokenUnits(
                            "ETH",
                            18,
                            feeCalculations[i]!.fee,
                          );
                        const tx = await wallet.sendTransaction({
                          to: treasuryWallet,
                          value: units.toString(),
                        });
                        await tx.wait?.();
                        await FeeCollectionService.completeFeeTransfer(
                          feeTx.id,
                          tx.hash,
                        );
                        console.log(
                          "[FeeTransfer][EVM][ETH] Completed fee transfer:",
                          tx.hash,
                        );
                      }
                    } catch (evErr) {
                      console.error(
                        "[FeeTransfer][EVM] Fee transfer failed:",
                        evErr,
                      );
                      await FeeCollectionService.failFeeTransfer(
                        feeTx.id,
                        (evErr as any)?.message || String(evErr),
                      );
                    }
                    return;
                  }

                  // Bitcoin
                  if (chain === "bitcoin") {
                    try {
                      const btcPrice = await PriceFeedService.getPrice("BTC");
                      if (!btcPrice || btcPrice <= 0)
                        throw new Error("Invalid BTC price");
                      const feeUSD = feeCalculations[i]!.fee;
                      const btcAmount = feeUSD / btcPrice;
                      // sendBitcoinTransaction expects amount as string in BTC
                      const amountStr = btcAmount.toString();
                      const txHash =
                        await SplitPaymentController.sendBitcoinTransaction(
                          splitPayment.fromAddress,
                          treasuryWallet,
                          amountStr,
                          splitPayment.network,
                          privateKey,
                        );
                      await FeeCollectionService.completeFeeTransfer(
                        feeTx.id,
                        txHash,
                      );
                      console.log(
                        "[FeeTransfer][BTC] Completed fee transfer:",
                        txHash,
                      );
                    } catch (btcErr) {
                      console.error(
                        "[FeeTransfer][BTC] Fee transfer failed:",
                        btcErr,
                      );
                      await FeeCollectionService.failFeeTransfer(
                        feeTx.id,
                        (btcErr as any)?.message || String(btcErr),
                      );
                    }
                    return;
                  }

                  // Stellar XLM
                  if (chain === "stellar") {
                    try {
                      const SDK = getStellarSdk();
                      const ServerClass =
                        SDK.Server || (SDK.Horizon && SDK.Horizon.Server);
                      const server = new ServerClass(
                        splitPayment.network === "testnet"
                          ? "https://horizon-testnet.stellar.org"
                          : "https://horizon.stellar.org",
                      );
                      const networkPassphrase =
                        splitPayment.network === "testnet"
                          ? SDK.Networks.TESTNET
                          : SDK.Networks.PUBLIC;

                      // Load source keypair
                      let sourceKeypair;
                      try {
                        sourceKeypair = SDK.Keypair.fromSecret(privateKey);
                      } catch (err) {
                        // try raw seed
                        const hex = privateKey.startsWith("0x")
                          ? privateKey.slice(2)
                          : privateKey;
                        const seedBuf = Buffer.from(hex, "hex");
                        sourceKeypair = SDK.Keypair.fromRawEd25519Seed(seedBuf);
                      }

                      const feeUSD = feeCalculations[i]!.fee;
                      const xlmPrice = await PriceFeedService.getPrice("XLM");
                      if (!xlmPrice || xlmPrice <= 0)
                        throw new Error("Invalid XLM price");
                      const xlmAmount = (feeUSD / xlmPrice).toFixed(7);

                      const account = await server.loadAccount(
                        sourceKeypair.publicKey(),
                      );
                      const txBuilder = new SDK.TransactionBuilder(account, {
                        fee: String(await server.fetchBaseFee()),
                        networkPassphrase,
                      });
                      txBuilder.addOperation(
                        SDK.Operation.payment({
                          destination: treasuryWallet,
                          asset: SDK.Asset.native(),
                          amount: xlmAmount,
                        }),
                      );
                      const tx = txBuilder.setTimeout(30).build();
                      tx.sign(sourceKeypair);
                      const resp = await server.submitTransaction(tx);
                      await FeeCollectionService.completeFeeTransfer(
                        feeTx.id,
                        resp.hash,
                      );
                      console.log(
                        "[FeeTransfer][XLM] Completed fee transfer:",
                        resp.hash,
                      );
                    } catch (xlmErr) {
                      console.error(
                        "[FeeTransfer][XLM] Fee transfer failed:",
                        xlmErr,
                      );
                      await FeeCollectionService.failFeeTransfer(
                        feeTx.id,
                        (xlmErr as any)?.message || String(xlmErr),
                      );
                    }
                    return;
                  }

                  // Polkadot
                  if (chain === "polkadot") {
                    try {
                      const {
                        ApiPromise,
                        WsProvider,
                        Keyring,
                      } = require("@polkadot/api");
                      const wsUrl =
                        splitPayment.network === "testnet"
                          ? process.env.POLKADOT_WS_TESTNET ||
                          "wss://pas-rpc.stakeworld.io"
                          : process.env.POLKADOT_WS_MAINNET ||
                          "wss://rpc.polkadot.io";
                      const provider = new WsProvider(wsUrl);
                      const api = await ApiPromise.create({ provider });

                      const keyring = new Keyring({ type: "sr25519" });
                      let sender: any = null;
                      try {
                        // Try mnemonic/uri
                        sender = keyring.addFromUri(privateKey);
                      } catch (e) {
                        // try JSON seed
                        const parsed = JSON.parse(privateKey);
                        if (parsed.mnemonic)
                          sender = keyring.addFromUri(parsed.mnemonic);
                        else if (parsed.seed)
                          sender = keyring.addFromSeed(
                            Buffer.from(parsed.seed, "hex"),
                          );
                      }

                      if (!sender)
                        throw new Error("Failed to load Polkadot sender key");

                      const feeUSD = feeCalculations[i]!.fee;
                      const dotPrice = await PriceFeedService.getPrice("DOT");
                      if (!dotPrice || dotPrice <= 0)
                        throw new Error("Invalid DOT price");
                      const dotAmount = feeUSD / dotPrice;
                      const planck = BigInt(Math.round(dotAmount * 1e10));

                      const transfer =
                        api.tx.balances.transferKeepAlive ||
                        api.tx.balances.transfer;
                      const tx = transfer(treasuryWallet, planck.toString());

                      const txHash = await new Promise<string>(
                        async (resolve, reject) => {
                          try {
                            const unsub = await tx.signAndSend(
                              sender,
                              (result: any) => {
                                const { status, dispatchError } = result;
                                if (dispatchError) {
                                  try {
                                    if (dispatchError.isModule) {
                                      const decoded =
                                        api.registry.findMetaError(
                                          dispatchError.asModule,
                                        );
                                      const { section, name, docs } = decoded;
                                      reject(
                                        new Error(
                                          `${section}.${name}: ${docs.join(" ")}`,
                                        ),
                                      );
                                    } else {
                                      reject(
                                        new Error(dispatchError.toString()),
                                      );
                                    }
                                  } catch (de) {
                                    reject(
                                      new Error(
                                        `Dispatch error: ${dispatchError.toString()}`,
                                      ),
                                    );
                                  }
                                  try {
                                    unsub();
                                  } catch { }
                                  return;
                                }

                                if (status.isInBlock) {
                                  resolve(status.asInBlock.toString());
                                  try {
                                    unsub();
                                  } catch { }
                                } else if (status.isFinalized) {
                                  resolve(status.asFinalized.toString());
                                  try {
                                    unsub();
                                  } catch { }
                                }
                              },
                            );
                          } catch (sendErr) {
                            reject(
                              sendErr instanceof Error
                                ? sendErr
                                : new Error(String(sendErr)),
                            );
                          }
                        },
                      );

                      await FeeCollectionService.completeFeeTransfer(
                        feeTx.id,
                        txHash,
                      );
                      console.log(
                        "[FeeTransfer][POLKADOT] Completed fee transfer:",
                        txHash,
                      );
                      try {
                        await api.disconnect();
                      } catch { }
                    } catch (dotErr) {
                      console.error(
                        "[FeeTransfer][POLKADOT] Fee transfer failed:",
                        dotErr,
                      );
                      await FeeCollectionService.failFeeTransfer(
                        feeTx.id,
                        (dotErr as any)?.message || String(dotErr),
                      );
                    }
                    return;
                  }

                  // If chain not supported yet, leave feeTx pending for sweeper
                  console.log(
                    "[FeeTransfer] Chain not supported for automatic fee transfer yet:",
                    chain,
                  );
                } catch (bgErr) {
                  console.error(
                    "[FeeTransfer] Background fee transfer failed:",
                    bgErr,
                  );
                  try {
                    await FeeCollectionService.failFeeTransfer(
                      feeTx.id,
                      (bgErr as any)?.message || String(bgErr),
                    );
                  } catch (markErr) {
                    console.warn("Failed to mark feeTx as failed:", markErr);
                  }
                }
              })().catch((e) =>
                console.error("Unexpected BG fee transfer error:", e),
              );

              feeRecords.push({
                recipient: activeRecipients[i]!.recipientAddress,
                amount: recipientAmounts[i],
                fee: feeCalculations[i]!.fee,
                tier: feeCalculations[i]!.tier,
                feeId: feeRecord.id,
              });

              console.log(
                `Fee recorded for ${activeRecipients[i]!.recipientAddress}: $${feeCalculations[i]!.fee.toFixed(2)} (${feeCalculations[i]!.tier})`,
              );
            }
          }

          console.log(
            `Total fees collected: $${totalFees.toFixed(2)} from ${feeRecords.length} successful payments`,
          );
        } catch (feeError) {
          console.error("Fee collection error (non-fatal):", feeError);
          // Don't fail the entire split payment if fee collection fails
          // The main payments were already executed successfully
        }
      }

      res.status(200).json({
        message: "Split payment executed successfully",
        execution: {
          id: savedExecution.id,
          status: savedExecution.status,
          total: results.length,
          successful: successCount,
          failed: failedCount,
          executionNumber: splitPayment.executionCount,
        },
        splitPayment: {
          id: splitPayment.id,
          title: splitPayment.title,
          totalExecutions: splitPayment.executionCount,
          lastExecutedAt: splitPayment.lastExecutedAt,
        },
        feeBreakdown: {
          totalPaymentAmount: totalPaymentAmount,
          totalFees: totalFees,
          senderPaysTotal: totalAmountWithFees,
          treasuryAddress: treasuryWallet,
          feeTxHash: feeTxHash,
          feeRecords: feeRecords,
        },
        results: results.map((r, i) => ({
          recipient: activeRecipients[i]!.recipientAddress,
          name: activeRecipients[i]!.recipientName,
          amount: activeRecipients[i]!.amount,
          success: r.success,
          txHash: r.txHash,
          error: r.error,
          fee: feeCalculations[i]?.fee,
          tier: feeCalculations[i]?.tier,
        })),
      });
    } catch (error) {
      console.error("Execute split payment error:", error);
      res.status(500).json({
        error: "Failed to execute split payment",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private static async processStarknetBatch(
    splitPayment: SplitPayment,
    recipients: SplitPaymentRecipient[],
    privateKey: string,
  ): Promise<Array<{ success: boolean; txHash?: string; error?: string }>> {
    const results: Array<{
      success: boolean;
      txHash?: string;
      error?: string;
    }> = [];

    if (!recipients || recipients.length === 0) return results;

    try {
      // Determine token - DEFAULT TO STRK for Starknet
      let tokenSymbol = "strk"; // ✅ Changed default from 'eth' to 'strk'
      if (splitPayment.chain === "starknet_eth") {
        tokenSymbol = "eth";
      } else if (splitPayment.chain === "starknet_usdc") {
        tokenSymbol = "usdc";
      } else if (splitPayment.chain === "starknet_usdt") {
        tokenSymbol = "usdt";
      } else if (splitPayment.chain === "starknet_dai") {
        tokenSymbol = "dai";
      }
      // If chain is just 'starknet' or 'starknet_strk' or 'strk', use STRK (already set)

      console.log("Starknet batch transfer setup:", {
        token: tokenSymbol.toUpperCase(),
        network: splitPayment.network,
        recipients: recipients.length,
        fromAddress: splitPayment.fromAddress,
        chain: splitPayment.chain,
      });

      // Use the exact same provider setup as sendTransaction
      const { RpcProvider, Account, uint256, Contract } = require("starknet");
      const provider = new RpcProvider({
        nodeUrl:
          splitPayment.network === "testnet"
            ? `https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_8/${process.env.ALCHEMY_STARKNET_KEY}`
            : `https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_9/${process.env.ALCHEMY_STARKNET_KEY}`,
      });

      console.log("✅ Connected to Starknet RPC");

      // Initialize account
      const account = new (Account as any)(
        provider,
        splitPayment.fromAddress,
        privateKey,
      );
      console.log("Account initialized:", splitPayment.fromAddress);

      // Verify account is deployed
      try {
        await provider.getClassHashAt(splitPayment.fromAddress);
        console.log("✅ Account is deployed");
      } catch (error) {
        const network =
          splitPayment.network === "testnet" ? "sepolia" : "mainnet";
        throw new Error(
          `Account not deployed on ${splitPayment.network}. ` +
          `Address: ${splitPayment.fromAddress}. ` +
          `Deploy at: https://${network}.voyager.online/contract/${splitPayment.fromAddress}`,
        );
      }

      // Token addresses - EXACTLY like sendTransaction
      const ethTokenAddress =
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
      const strkTokenAddress =
        "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

      const tokenAddress =
        tokenSymbol === "strk" ? strkTokenAddress : ethTokenAddress;

      console.log(
        `Using token contract: ${tokenAddress} (${tokenSymbol.toUpperCase()})`,
      );

      // ✅ CHECK BALANCE FIRST
      try {
        const erc20Abi = [
          {
            name: "balanceOf",
            type: "function",
            inputs: [{ name: "account", type: "felt" }],
            outputs: [{ name: "balance", type: "Uint256" }],
            stateMutability: "view",
          },
        ];

        const tokenContract = new Contract(erc20Abi, tokenAddress, provider);
        const balanceResult = await tokenContract.balanceOf(
          splitPayment.fromAddress,
        );

        // Extract balance
        let balanceBigInt: bigint;
        if (typeof balanceResult === "object" && "balance" in balanceResult) {
          const bal = balanceResult.balance;
          if (typeof bal === "object" && "low" in bal && "high" in bal) {
            balanceBigInt = uint256.uint256ToBN(bal);
          } else {
            balanceBigInt = BigInt(bal);
          }
        } else if (Array.isArray(balanceResult) && balanceResult.length > 0) {
          const bal = balanceResult[0];
          if (typeof bal === "object" && "low" in bal && "high" in bal) {
            balanceBigInt = uint256.uint256ToBN(bal);
          } else {
            balanceBigInt = BigInt(bal);
          }
        } else {
          balanceBigInt = BigInt(balanceResult);
        }

        const balanceInToken = Number(balanceBigInt) / 1e18;
        console.log(
          `\n💰 Current ${tokenSymbol.toUpperCase()} balance: ${balanceInToken.toFixed(6)}`,
        );

        // Calculate total needed
        const totalTransferAmount = recipients.reduce(
          (sum, r) => sum + parseFloat(r.amount),
          0,
        );
        const estimatedFeesInToken = 0.001 * recipients.length; // Conservative estimate
        const totalNeeded = totalTransferAmount + estimatedFeesInToken;

        console.log(`📊 Balance check:`, {
          available: `${balanceInToken.toFixed(6)} ${tokenSymbol.toUpperCase()}`,
          needed: `${totalNeeded.toFixed(6)} ${tokenSymbol.toUpperCase()}`,
          transfers: `${totalTransferAmount.toFixed(6)} ${tokenSymbol.toUpperCase()}`,
          estimatedFees: `${estimatedFeesInToken.toFixed(6)} ${tokenSymbol.toUpperCase()}`,
        });

        if (balanceInToken < totalNeeded) {
          throw new Error(
            `❌ Insufficient ${tokenSymbol.toUpperCase()} balance!\n` +
            `Available: ${balanceInToken.toFixed(6)} ${tokenSymbol.toUpperCase()}\n` +
            `Required: ${totalNeeded.toFixed(6)} ${tokenSymbol.toUpperCase()}\n` +
            `(${totalTransferAmount.toFixed(6)} transfers + ~${estimatedFeesInToken.toFixed(6)} fees)\n\n` +
            `💡 TIP: You're trying to send ${tokenSymbol.toUpperCase()}. Make sure:\n` +
            `   1. You have enough ${tokenSymbol.toUpperCase()} in the account\n` +
            `   2. The 'chain' field matches the token (use 'starknet' or 'starknet_strk' for STRK, 'starknet_eth' for ETH)`,
          );
        }

        console.log("✅ Balance check passed\n");
      } catch (balanceErr) {
        if ((balanceErr as any)?.message?.includes("Insufficient")) {
          throw balanceErr;
        }
        console.warn(
          "⚠️ Could not check balance:",
          (balanceErr as any)?.message,
        );
        console.warn(
          "Proceeding anyway - transaction will fail if insufficient balance\n",
        );
      }

      // Process each recipient individually
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];

        try {
          const recipientAddr = recipient!.recipientAddress;
          const amountNum = parseFloat(recipient!.amount);

          console.log(`[${i + 1}/${recipients.length}] Processing payment:`, {
            to: recipientAddr,
            amount: amountNum,
            token: tokenSymbol.toUpperCase(),
          });

          // Convert amount to uint256
          const amountInWei = uint256.bnToUint256(
            BigInt(Math.floor(amountNum * 1e18)),
          );

          // Build the transfer call
          const transferCall = {
            contractAddress: tokenAddress,
            entrypoint: "transfer",
            calldata: [recipientAddr, amountInWei.low, amountInWei.high],
          };

          console.log(`Executing transaction ${i + 1}...`);

          // Execute transaction
          const result = await account.execute(transferCall);
          const txHash = result.transaction_hash;

          if (!txHash) {
            throw new Error("No transaction hash returned");
          }

          console.log(`✅ Transaction ${i + 1} sent: ${txHash}`);

          // Wait for transaction confirmation
          try {
            console.log(`⏳ Waiting for confirmation...`);
            await provider.waitForTransaction(txHash, {
              retryInterval: 2000,
              successStates: ["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"],
            });
            console.log(`✅ Transaction ${i + 1} confirmed!`);
          } catch (waitErr) {
            console.warn(
              `⚠️ Could not confirm transaction ${i + 1}, but it was sent:`,
              (waitErr as any)?.message,
            );
          }

          const explorerNetwork =
            splitPayment.network === "testnet" ? "sepolia" : "mainnet";
          console.log(
            `🔍 View: https://${explorerNetwork}.voyager.online/tx/${txHash}\n`,
          );

          results.push({ success: true, txHash });

          // Wait between transactions to avoid nonce conflicts
          if (i < recipients.length - 1) {
            const delayMs = 5000;
            console.log(`⏳ Waiting ${delayMs}ms before next transaction...\n`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        } catch (err) {
          const errorMsg = (err as any)?.message || String(err);
          console.error(
            `❌ [${i + 1}/${recipients.length}] Failed to send to ${recipient!.recipientAddress}:`,
          );
          console.error(`   ${errorMsg}\n`);

          results.push({
            success: false,
            error: errorMsg,
          });

          // Continue with remaining recipients
          console.log(`Continuing with remaining recipients...\n`);
        }
      }
    } catch (error) {
      console.error("❌ Starknet batch processing error:", error);
      const errorMsg = (error as any)?.message || String(error);

      // If initialization failed, mark all as failed
      if (results.length === 0) {
        for (const _ of recipients) {
          results.push({
            success: false,
            error: errorMsg,
          });
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log("\n📊 Starknet batch complete:", {
      total: recipients.length,
      successful: successCount,
      failed: failCount,
      successRate: `${((successCount / recipients.length) * 100).toFixed(1)}%`,
    });

    return results;
  }

  private static async processStellarBatch(
    splitPayment: SplitPayment,
    recipients: SplitPaymentRecipient[],
    privateKey: string,
  ): Promise<Array<{ success: boolean; txHash?: string; error?: string }>> {
    const results: Array<{
      success: boolean;
      txHash?: string;
      error?: string;
    }> = [];

    const StellarSdkLocal = getStellarSdk();

    if (!StellarSdkLocal) {
      const errorMsg =
        "Stellar SDK not installed. Install it with: npm install @stellar/stellar-sdk (or npm install stellar-sdk) and restart the server.";
      console.error("Stellar SDK missing");
      for (const _ of recipients) {
        results.push({ success: false, error: errorMsg });
      }
      return results;
    }

    try {
      // Normalize default export if present (ESM interop)
      const SDK = (StellarSdkLocal &&
        (StellarSdkLocal.default || StellarSdkLocal)) as any;

      if (!SDK) {
        const msg = "Loaded Stellar SDK is invalid";
        console.error(msg, { SDK });
        for (const _ of recipients) {
          results.push({ success: false, error: msg });
        }
        return results;
      }

      // Handle different SDK versions - Server can be at SDK.Server or SDK.Horizon.Server
      const ServerClass = SDK.Server || (SDK.Horizon && SDK.Horizon.Server);
      if (!ServerClass || typeof ServerClass !== "function") {
        const msg =
          "Loaded Stellar SDK is missing Server constructor. Check installed version of stellar-sdk.";
        console.error(msg, { SDK });
        for (const _ of recipients) {
          results.push({ success: false, error: msg });
        }
        return results;
      }

      const network = (splitPayment.network || "mainnet").toLowerCase();
      const server = new ServerClass(
        network === "testnet"
          ? "https://horizon-testnet.stellar.org"
          : "https://horizon.stellar.org",
      );

      const networkPassphrase =
        network === "testnet" ? SDK.Networks.TESTNET : SDK.Networks.PUBLIC;

      console.log("Stellar network configuration:", {
        network,
        networkPassphrase,
      });

      // Load source keypair
      let sourceKeypair;
      try {
        sourceKeypair = SDK.Keypair.fromSecret(privateKey);
        console.log(
          "Loaded Stellar keypair from secret key, public key:",
          sourceKeypair.publicKey(),
        );
      } catch (secretErr) {
        try {
          const hex = privateKey.startsWith("0x")
            ? privateKey.slice(2)
            : privateKey;
          const seedBuf = Buffer.from(hex, "hex");

          if (seedBuf.length !== 32) {
            throw new Error(
              `Invalid seed length: ${seedBuf.length} bytes (expected 32)`,
            );
          }

          sourceKeypair = SDK.Keypair.fromRawEd25519Seed(seedBuf);
          console.log(
            "Loaded Stellar keypair from hex seed, public key:",
            sourceKeypair.publicKey(),
          );
        } catch (hexErr) {
          console.error("Failed to parse Stellar private key:", {
            secretErr: (secretErr as any)?.message,
            hexErr: (hexErr as any)?.message,
          });
          throw new Error(
            `Invalid Stellar secret key format. Must be either a secret key (starting with S) or a 32-byte hex seed.`,
          );
        }
      }

      // Fetch account and base fee
      let account;
      try {
        account = await server.loadAccount(sourceKeypair.publicKey());
        console.log("Loaded Stellar account:", {
          publicKey: sourceKeypair.publicKey(),
          sequence: account.sequenceNumber(),
          balances: account.balances,
        });
      } catch (accountErr) {
        console.error("Failed to load Stellar account:", {
          publicKey: sourceKeypair.publicKey(),
          network,
          error: (accountErr as any)?.message || String(accountErr),
        });
        throw new Error(
          `Failed to load Stellar account ${sourceKeypair.publicKey()} on ${network}: ${(accountErr as any)?.response?.data?.detail ||
          (accountErr as any)?.message ||
          String(accountErr)
          }`,
        );
      }

      const baseFee = await server.fetchBaseFee().catch((err: unknown) => {
        console.warn(
          "Failed to fetch base fee, using default 100 stroops:",
          err,
        );
        return 100;
      });

      // Process payments
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        try {
          const dest = recipient!.recipientAddress;
          const amountStr = Number(recipient!.amount).toFixed(7);

          console.log(`Processing payment ${i + 1}/${recipients.length}:`, {
            to: dest,
            amount: amountStr,
          });

          const freshAccount = await server.loadAccount(
            sourceKeypair.publicKey(),
          );

          const txBuilder = new SDK.TransactionBuilder(freshAccount, {
            fee: String(baseFee),
            networkPassphrase: networkPassphrase,
          });

          let destExists = true;
          try {
            await server.loadAccount(dest);
          } catch (err) {
            destExists = false;
          }

          if (!destExists) {
            const createAmount = Math.max(Number(amountStr), 1).toFixed(7);
            txBuilder.addOperation(
              SDK.Operation.createAccount({
                destination: dest,
                startingBalance: createAmount,
              }),
            );
          } else {
            txBuilder.addOperation(
              SDK.Operation.payment({
                destination: dest,
                asset: SDK.Asset.native(),
                amount: amountStr,
              }),
            );
          }

          const tx = txBuilder.setTimeout(30).build();
          tx.sign(sourceKeypair);

          const resp = await server.submitTransaction(tx);

          console.log("Payment successful:", {
            hash: resp.hash,
            ledger: resp.ledger,
            recipient: dest,
          });

          results.push({ success: true, txHash: resp.hash });

          if (i < recipients.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (err) {
          const errorMsg =
            (err as any)?.response?.data?.extras?.result_codes ||
            (err as any)?.message ||
            String(err);
          console.error(
            `Failed to send payment to ${recipient!.recipientAddress}:`,
            errorMsg,
          );
          results.push({
            success: false,
            error:
              typeof errorMsg === "object"
                ? JSON.stringify(errorMsg)
                : String(errorMsg),
          });
        }
      }
    } catch (error) {
      console.error("Stellar batch processing error:", error);
      if (results.length === 0) {
        for (const _ of recipients) {
          results.push({
            success: false,
            error: (error as any)?.message
              ? (error as any).message
              : String(error),
          });
        }
      }
    }

    return results;
  }

  /**
   * Process Polkadot split batch payments
   */
  private static async processPolkadotBatch(
    splitPayment: SplitPayment,
    recipients: SplitPaymentRecipient[],
    privateKey: string,
  ): Promise<Array<{ success: boolean; txHash?: string; error?: string }>> {
    const results: Array<{
      success: boolean;
      txHash?: string;
      error?: string;
    }> = [];

    if (!recipients || recipients.length === 0) return results;

    try {
      // Load Polkadot SDK
      const { ApiPromise, WsProvider } = require("@polkadot/api");
      const { Keyring } = require("@polkadot/keyring");
      const { decodeAddress, encodeAddress } = require("@polkadot/util-crypto");

      const wsUrl =
        splitPayment.network === "testnet"
          ? process.env.POLKADOT_WS_TESTNET || "wss://pas-rpc.stakeworld.io"
          : process.env.POLKADOT_WS_MAINNET || "wss://rpc.polkadot.io";

      console.log(`[Polkadot Split] Connecting to ${wsUrl}...`);

      const provider = new WsProvider(wsUrl);
      const api = await ApiPromise.create({ provider });

      const reportedChain = (await api.rpc.system.chain()).toString();
      console.log(`[Polkadot Split] Connected to: ${reportedChain}`);

      // Initialize keyring and load sender keypair
      const keyring = new Keyring({ type: "sr25519" });
      let sender: any = null;
      const pkStr =
        typeof privateKey === "string" ? privateKey : String(privateKey);

      // Parse private key (supports JSON format from generatePolkadotWallet)
      try {
        const keyData = JSON.parse(pkStr);

        if (keyData.mnemonic) {
          sender = keyring.addFromUri(keyData.mnemonic);
          console.log(
            "[Polkadot Split] Loaded keypair from mnemonic (JSON format)",
          );
        } else if (keyData.seed) {
          const seedBuffer = Buffer.from(keyData.seed, "hex");
          sender = keyring.addFromSeed(seedBuffer);
          console.log(
            "[Polkadot Split] Loaded keypair from seed (JSON format)",
          );
        } else {
          throw new Error("JSON private key missing both mnemonic and seed");
        }
      } catch (jsonErr) {
        // Not JSON, try legacy formats
        try {
          sender = keyring.addFromUri(pkStr);
          console.log("[Polkadot Split] Loaded keypair from URI/mnemonic");
        } catch (e1) {
          try {
            const seedHex = pkStr.replace(/^0x/, "");
            if (seedHex.length === 64) {
              const seed = Buffer.from(seedHex, "hex");
              sender = keyring.addFromSeed(seed);
              console.log("[Polkadot Split] Loaded keypair from hex seed");
            } else {
              throw new Error(`Invalid seed length: ${seedHex.length}`);
            }
          } catch (e2) {
            throw new Error(
              "Failed to load Polkadot keypair. Ensure private key is in correct format. " +
              `Error: ${e2 instanceof Error ? e2.message : String(e2)}`,
            );
          }
        }
      }

      if (!sender) {
        throw new Error("Failed to initialize Polkadot sender keypair");
      }

      // Verify sender address matches
      const derivedPubKey = sender.publicKey;
      const storedPubKey = decodeAddress(splitPayment.fromAddress);

      if (
        Buffer.from(derivedPubKey).toString("hex") !==
        Buffer.from(storedPubKey).toString("hex")
      ) {
        throw new Error(
          `Private key mismatch! Derived address: ${sender.address}, ` +
          `Stored address: ${splitPayment.fromAddress}`,
        );
      }

      console.log(
        `[Polkadot Split] Sender verified: ${splitPayment.fromAddress}`,
      );

      // Check sender balance
      const accountInfo = await api.query.system.account(
        splitPayment.fromAddress,
      );
      const balance = accountInfo.data.free.toBigInt();
      const balanceDOT = Number(balance) / 1e10;

      console.log(`[Polkadot Split] Sender balance: ${balanceDOT} DOT`);

      // Calculate total amount needed
      const totalTransferAmount = recipients.reduce(
        (sum, recipient) => sum + Number(recipient.amount),
        0,
      );

      // Estimate fees (conservative: 0.01 DOT per transaction)
      const estimatedFeePerTx = 0.01;
      const totalEstimatedFees = estimatedFeePerTx * recipients.length;
      const totalNeeded = totalTransferAmount + totalEstimatedFees;

      if (balanceDOT < totalNeeded) {
        throw new Error(
          `Insufficient balance. Available: ${balanceDOT} DOT, ` +
          `Required: ${totalNeeded} DOT (${totalTransferAmount} transfers + ${totalEstimatedFees} fees)`,
        );
      }

      // Process each recipient individually
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];

        try {
          const dest = recipient!.recipientAddress;
          const amountDOT = Number(recipient!.amount);
          const planck = BigInt(Math.round(amountDOT * 1e10));

          console.log(
            `[Polkadot Split] [${i + 1}/${recipients.length}] ` +
            `Sending ${amountDOT} DOT (${planck} Planck) to ${dest}`,
          );

          // Validate recipient address
          try {
            decodeAddress(dest);
          } catch (err) {
            throw new Error(`Invalid recipient address: ${dest}`);
          }

          // Create transfer transaction (use transferKeepAlive to prevent account reaping)
          const transfer =
            api.tx.balances.transferKeepAlive || api.tx.balances.transfer;
          if (!transfer) {
            throw new Error("No transfer method available on this chain");
          }

          const tx = transfer(dest, planck.toString());

          // Sign and send transaction
          const txHash = await new Promise<string>(async (resolve, reject) => {
            try {
              const unsub = await tx.signAndSend(sender, (result: any) => {
                const { status, dispatchError, events } = result;

                // Handle errors
                if (dispatchError) {
                  try {
                    if (dispatchError.isModule) {
                      const decoded = api.registry.findMetaError(
                        dispatchError.asModule,
                      );
                      const { section, name, docs } = decoded;
                      const errorMsg = `${section}.${name}: ${docs.join(" ")}`;
                      reject(new Error(errorMsg));
                    } else {
                      reject(new Error(dispatchError.toString()));
                    }
                  } catch (de) {
                    reject(
                      new Error(`Dispatch error: ${dispatchError.toString()}`),
                    );
                  }
                  try {
                    unsub();
                  } catch { }
                  return;
                }

                // Transaction included in block
                if (status.isInBlock) {
                  console.log(
                    `[Polkadot Split] Transaction ${i + 1} included: ${status.asInBlock.toString()}`,
                  );
                  resolve(status.asInBlock.toString());
                  try {
                    unsub();
                  } catch { }
                } else if (status.isFinalized) {
                  console.log(
                    `[Polkadot Split] Transaction ${i + 1} finalized: ${status.asFinalized.toString()}`,
                  );
                  resolve(status.asFinalized.toString());
                  try {
                    unsub();
                  } catch { }
                }
              });
            } catch (sendErr) {
              reject(
                sendErr instanceof Error ? sendErr : new Error(String(sendErr)),
              );
            }
          });

          console.log(
            `[Polkadot Split] ✅ Transfer ${i + 1} successful: ${txHash}`,
          );
          results.push({ success: true, txHash });

          // Small delay between transactions to avoid overwhelming the network
          if (i < recipients.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch (err) {
          const errorMsg = (err as any)?.message || String(err);
          console.error(
            `[Polkadot Split] ❌ Transfer ${i + 1} failed for ${recipient!.recipientAddress}:`,
            errorMsg,
          );
          results.push({
            success: false,
            error: errorMsg,
          });
        }
      }

      // Disconnect from API
      try {
        await api.disconnect();
        console.log("[Polkadot Split] Disconnected from API");
      } catch { }
    } catch (error) {
      console.error("[Polkadot Split] Batch processing error:", error);

      // If we haven't processed any yet, mark all as failed
      if (results.length === 0) {
        const errorMsg = (error as any)?.message || String(error);
        for (const _ of recipients) {
          results.push({
            success: false,
            error: errorMsg,
          });
        }
      }
    }

    return results;
  }

  /**
   * Get all split payment templates (reusable)
   * GET /split-payment/templates
   */
  static async getSplitPaymentTemplates(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { status = "active" } = req.query;

      const splitPaymentRepo = AppDataSource.getRepository(SplitPayment);
      const queryBuilder = splitPaymentRepo
        .createQueryBuilder("splitPayment")
        .where("splitPayment.userId = :userId", {
          userId: req.user!.id,
        })
        .leftJoinAndSelect("splitPayment.recipients", "recipients")
        .orderBy("splitPayment.lastExecutedAt", "DESC")
        .addOrderBy("splitPayment.createdAt", "DESC");

      if (status === "active") {
        queryBuilder.andWhere("splitPayment.status = :status", {
          status: SplitPaymentStatus.ACTIVE,
        });
      }

      const splitPayments = await queryBuilder.getMany();

      res.status(200).json({
        message: "Split payment templates retrieved successfully",
        templates: splitPayments.map((sp) => ({
          id: sp.id,
          title: sp.title,
          description: sp.description,
          chain: sp.chain,
          network: sp.network,
          currency: sp.currency,
          totalAmount: sp.totalAmount,
          totalRecipients: sp.totalRecipients,
          executionCount: sp.executionCount,
          status: sp.status,
          createdAt: sp.createdAt,
          lastExecutedAt: sp.lastExecutedAt,
          recipientCount: sp.recipients?.filter((r) => r.isActive).length || 0,
          canExecute: sp.status === SplitPaymentStatus.ACTIVE,
        })),
        totalTemplates: splitPayments.length,
      });
    } catch (error) {
      console.error("Get split payment templates error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get execution history for a split payment
   * GET /split-payment/:id/executions
   */
  static async getExecutionHistory(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: "Missing split payment ID" });
        return;
      }

      const paymentId = typeof id === "string" ? id : id[0];
      const { page = 1, limit = 20 } = req.query;

      // Verify ownership
      const splitPaymentRepo = AppDataSource.getRepository(SplitPayment);
      const splitPayment = await splitPaymentRepo.findOne({
        where: { id: paymentId!, userId: req.user!.id! },
      });

      if (!splitPayment) {
        res.status(404).json({ error: "Split payment not found" });
        return;
      }

      const executionRepo = AppDataSource.getRepository(SplitPaymentExecution);
      const [executions, total] = await executionRepo
        .createQueryBuilder("execution")
        .where("execution.splitPaymentId = :splitPaymentId", {
          splitPaymentId: id,
        })
        .leftJoinAndSelect("execution.results", "results")
        .orderBy("execution.createdAt", "DESC")
        .skip((Number(page) - 1) * Number(limit))
        .take(Number(limit))
        .getManyAndCount();

      res.status(200).json({
        message: "Execution history retrieved successfully",
        splitPayment: {
          id: splitPayment.id,
          title: splitPayment.title,
          totalExecutions: splitPayment.executionCount,
        },
        executions: executions.map((exec) => ({
          id: exec.id,
          status: exec.status,
          totalAmount: exec.totalAmount,
          totalRecipients: exec.totalRecipients,
          successfulPayments: exec.successfulPayments,
          failedPayments: exec.failedPayments,
          totalFees: exec.totalFees,
          createdAt: exec.createdAt,
          completedAt: exec.completedAt,
          resultCount: exec.results?.length || 0,
        })),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Get execution history error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Toggle split payment status (activate/deactivate)
   * PATCH /split-payment/:id/toggle
   */
  static async toggleSplitPayment(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: "Missing split payment ID" });
        return;
      }

      const paymentId = typeof id === "string" ? id : id[0];

      const splitPaymentRepo = AppDataSource.getRepository(SplitPayment);
      const splitPayment = await splitPaymentRepo.findOne({
        where: { id: paymentId as string, userId: req.user!.id as string },
      });

      if (!splitPayment) {
        res.status(404).json({ error: "Split payment not found" });
        return;
      }

      // Toggle status
      splitPayment.status =
        splitPayment.status === SplitPaymentStatus.ACTIVE
          ? SplitPaymentStatus.INACTIVE
          : SplitPaymentStatus.ACTIVE;

      await splitPaymentRepo.save(splitPayment);

      res.status(200).json({
        message: `Split payment ${splitPayment.status === SplitPaymentStatus.ACTIVE
          ? "activated"
          : "deactivated"
          } successfully`,
        splitPayment: {
          id: splitPayment.id,
          title: splitPayment.title,
          status: splitPayment.status,
          canExecute: splitPayment.status === SplitPaymentStatus.ACTIVE,
        },
      });
    } catch (error) {
      console.error("Toggle split payment error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Private methods for processing different chains
  private static async processEthereumBatch(
    splitPayment: SplitPayment,
    recipients: SplitPaymentRecipient[],
    privateKey: string,
  ): Promise<Array<{ success: boolean; txHash?: string; error?: string }>> {
    const results = [];
    const provider = new ethers.JsonRpcProvider(
      splitPayment.network === "testnet"
        ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`
        : `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_STARKNET_KEY}`,
    );
    const wallet = new ethers.Wallet(privateKey, provider);

    for (const recipient of recipients) {
      try {
        let tx;
        if (splitPayment.chain === "ethereum") {
          tx = await wallet.sendTransaction({
            to: recipient.recipientAddress,
            value: ethers.parseEther(recipient.amount),
          });
        } else {
          // USDT ERC20
          const usdtAddress =
            splitPayment.network === "testnet"
              ? "0x516de3a7a567d81737e3a46ec4ff9cfd1fcb0136"
              : "0xdAC17F958D2ee523a2206206994597C13D831ec7";
          const usdtAbi = [
            "function transfer(address to, uint256 value) public returns (bool)",
          ];
          const usdtContract = new ethers.Contract(
            usdtAddress,
            usdtAbi,
            wallet,
          );
          tx = await usdtContract.transfer!(
            recipient.recipientAddress,
            ethers.parseUnits(recipient.amount, 6),
          );
        }

        results.push({ success: true, txHash: tx.hash });
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private static async processBitcoinBatch(
    splitPayment: SplitPayment,
    recipients: SplitPaymentRecipient[],
    privateKey: string,
  ): Promise<Array<{ success: boolean; txHash?: string; error?: string }>> {
    try {
      // Create one transaction with multiple outputs (true batch payment)
      const txHash = await SplitPaymentController.sendBitcoinBatchTransaction(
        splitPayment.fromAddress,
        recipients,
        splitPayment.network,
        privateKey,
      );

      // All recipients share the same transaction hash
      return recipients.map(() => ({
        success: true,
        txHash: txHash,
      }));
    } catch (error) {
      console.error("Bitcoin batch payment failed:", error);
      // If batch fails, all recipients fail
      return recipients.map(() => ({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  private static async processSolanaBatch(
    splitPayment: SplitPayment,
    recipients: SplitPaymentRecipient[],
    privateKey: string,
  ): Promise<Array<{ success: boolean; txHash?: string; error?: string }>> {
    const results = [];
    const connection = new Connection(
      splitPayment.network === "testnet"
        ? "https://api.devnet.solana.com"
        : "https://api.mainnet-beta.solana.com",
    );

    try {
      let secretKeyArray: Uint8Array;
      try {
        const parsed = JSON.parse(privateKey);
        if (Array.isArray(parsed)) {
          secretKeyArray = Uint8Array.from(parsed);
        } else {
          throw new Error("Not an array");
        }
      } catch {
        const cleanHex = privateKey.startsWith("0x")
          ? privateKey.slice(2)
          : privateKey;
        const buffer = Buffer.from(cleanHex, "hex");
        if (buffer.length === 32) {
          const tempKeypair = Keypair.fromSeed(buffer);
          secretKeyArray = tempKeypair.secretKey;
        } else if (buffer.length === 64) {
          secretKeyArray = new Uint8Array(buffer);
        } else {
          throw new Error(
            `Invalid Solana private key length: ${buffer.length}`,
          );
        }
      }

      const fromKeypair = Keypair.fromSecretKey(secretKeyArray);

      // Check sender balance
      const senderBalance = await connection.getBalance(fromKeypair.publicKey);
      const rentExemptMinimum =
        await connection.getMinimumBalanceForRentExemption(0);

      // Calculate total amount needed (transfers + fees + rent buffer)
      const totalTransferAmount = recipients.reduce(
        (sum, recipient) => sum + Math.round(Number(recipient.amount) * 1e9),
        0,
      );

      // Estimate fees (5000 lamports per signature is conservative)
      const estimatedFees = 5000 * recipients.length;
      const totalNeeded =
        totalTransferAmount + estimatedFees + rentExemptMinimum;

      if (senderBalance < totalNeeded) {
        throw new Error(
          `Insufficient balance. Available: ${senderBalance / 1e9} SOL, ` +
          `Required: ${totalNeeded / 1e9
          } SOL (including transfers, fees, and rent)`,
        );
      }

      // Process individual transactions instead of batch
      for (const recipient of recipients) {
        try {
          const toPubkey = new PublicKey(recipient.recipientAddress);
          const transferAmount = Math.round(Number(recipient.amount) * 1e9);

          // Check if recipient account exists and needs rent
          const recipientInfo = await connection.getAccountInfo(toPubkey);
          let finalTransferAmount = transferAmount;

          // If account doesn't exist, add rent-exempt minimum
          if (!recipientInfo) {
            finalTransferAmount = transferAmount + rentExemptMinimum;
          }

          const transaction = new SolTx();
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: fromKeypair.publicKey,
              toPubkey,
              lamports: finalTransferAmount,
            }),
          );

          // Get recent blockhash and fee calculator
          const { blockhash } = await connection.getLatestBlockhash();
          transaction.recentBlockhash = blockhash;
          transaction.feePayer = fromKeypair.publicKey;

          // Send and confirm individual transaction
          const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [fromKeypair],
            {
              commitment: "confirmed",
              preflightCommitment: "confirmed",
            },
          );

          results.push({ success: true, txHash: signature });

          // Small delay between transactions to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (error) {
          console.error(
            `Failed to send to ${recipient.recipientAddress}:`,
            error,
          );
          results.push({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      console.error("Solana batch processing error:", error);
      // If setup fails, mark all as failed
      for (const recipient of recipients) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  private static async sendBitcoinBatchTransaction(
    fromAddress: string,
    recipients: SplitPaymentRecipient[],
    network: string,
    privateKey: string,
  ): Promise<string> {
    try {
      // Setup network
      const isTestnet = network === "testnet";
      const btcNetwork = isTestnet
        ? bitcoin.networks.testnet
        : bitcoin.networks.bitcoin;
      const apiBaseUrl = isTestnet
        ? "https://blockstream.info/testnet/api"
        : "https://blockstream.info/api";

      // Create key pair from private key
      let keyPair = ECPair.fromWIF(privateKey, btcNetwork);
      // Patch keyPair.publicKey to Buffer if needed for compatibility with bitcoinjs-lib
      if (keyPair.publicKey && !(keyPair.publicKey instanceof Buffer)) {
        // Convert Uint8Array to Buffer for compatibility
        keyPair = Object.assign(
          Object.create(Object.getPrototypeOf(keyPair)),
          keyPair,
          {
            publicKey: Buffer.from(keyPair.publicKey as Uint8Array),
          },
        );
      }

      // Calculate total amount needed
      const totalTransferAmount = recipients.reduce(
        (sum, recipient) =>
          sum + Math.round(parseFloat(recipient.amount) * 100000000),
        0,
      );

      // Get UTXOs for the sender address
      const utxosResponse = await axios.get(
        `${apiBaseUrl}/address/${fromAddress}/utxo`,
      );
      const utxos = Array.isArray(utxosResponse.data) ? utxosResponse.data : [];

      if (utxos.length === 0) {
        throw new Error("No UTXOs found for sender address");
      }

      // Calculate fee (estimate bytes for multi-output transaction)
      // Base transaction: ~10 bytes
      // Each input: ~150 bytes
      // Each output: ~35 bytes
      const estimatedInputs = Math.min(utxos.length, 10); // Limit inputs for efficiency
      const totalOutputs = recipients.length + 1; // recipients + change
      const estimatedSize = 10 + estimatedInputs * 150 + totalOutputs * 35;
      const feeRate = 20; // satoshis per byte (adjustable)
      const estimatedFee = estimatedSize * feeRate;

      const totalRequired = totalTransferAmount + estimatedFee;

      // Select UTXOs
      let inputAmount = 0;
      const selectedUtxos = [];

      // Sort UTXOs by value (largest first) for efficient selection
      const sortedUtxos = utxos.sort((a: any, b: any) => b.value - a.value);

      for (const utxo of sortedUtxos) {
        selectedUtxos.push(utxo);
        inputAmount += utxo.value;

        if (inputAmount >= totalRequired) {
          break;
        }

        // Limit number of inputs to avoid overly complex transactions
        if (selectedUtxos.length >= 10) {
          break;
        }
      }

      if (inputAmount < totalRequired) {
        throw new Error(
          `Insufficient balance. Required: ${totalRequired} satoshis (${totalRequired / 100000000
          } BTC), ` +
          `Available: ${inputAmount} satoshis (${inputAmount / 100000000
          } BTC)`,
        );
      }

      // Create transaction with multiple outputs
      const psbt = new bitcoin.Psbt({ network: btcNetwork });

      // Add inputs
      for (const utxo of selectedUtxos) {
        try {
          // Get transaction hex for each UTXO
          const txResponse = await axios.get(
            `${apiBaseUrl}/tx/${utxo.txid}/hex`,
          );
          const nonWitnessUtxo = Buffer.from(txResponse.data as string, "hex");

          psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            nonWitnessUtxo,
          });
        } catch (error) {
          console.error(
            `Failed to get transaction data for UTXO ${utxo.txid}:`,
            error,
          );
          throw new Error(`Failed to fetch UTXO data: ${utxo.txid}`);
        }
      }

      // Add outputs for each recipient
      for (const recipient of recipients) {
        const amount = Math.round(parseFloat(recipient.amount) * 100000000);

        if (amount < 546) {
          // Bitcoin dust threshold
          throw new Error(
            `Amount too small for recipient ${recipient.recipientAddress}: ` +
            `${amount} satoshis (minimum 546 satoshis)`,
          );
        }

        psbt.addOutput({
          address: recipient.recipientAddress,
          value: BigInt(amount),
        });
      }

      // Add change output if needed
      const changeAmount = inputAmount - totalTransferAmount - estimatedFee;
      if (changeAmount >= 546) {
        psbt.addOutput({
          address: fromAddress,
          value: BigInt(changeAmount),
        });
      }

      // Sign all inputs
      for (let i = 0; i < selectedUtxos.length; i++) {
        psbt.signInput(i, keyPair);
      }

      // Finalize and extract transaction
      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();

      // Broadcast transaction
      const broadcastResponse = await axios.post(`${apiBaseUrl}/tx`, txHex, {
        headers: {
          "Content-Type": "text/plain",
        },
      });

      // The response should be the transaction ID
      const txId =
        typeof broadcastResponse.data === "string"
          ? broadcastResponse.data
          : tx.getId();

      console.log(`Bitcoin batch transaction successful: ${txId}`);
      return txId;
    } catch (error) {
      console.error("Bitcoin batch transaction error:", error);

      throw new Error(
        `Failed to send Bitcoin batch transaction: ${error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Keep the individual transaction method as backup
  private static async sendBitcoinTransaction(
    fromAddress: string,
    toAddress: string,
    amount: string,
    network: string,
    privateKey: string,
  ): Promise<string> {
    // Convert single transaction to batch format for code reuse
    const recipients = [
      {
        recipientAddress: toAddress,
        amount: amount,
      },
    ] as SplitPaymentRecipient[];

    return this.sendBitcoinBatchTransaction(
      fromAddress,
      recipients,
      network,
      privateKey,
    );
  }
}

// Helper function
function getCurrencyFromChain(chain: string): string {
  switch (chain) {
    case "ethereum":
      return "ETH";
    case "bitcoin":
      return "BTC";
    case "solana":
      return "SOL";
    case "starknet":
      return "STRK";
    case "usdt_erc20":
    case "usdt_trc20":
      return "USDT";
    default:
      return chain.toUpperCase();
  }
}
