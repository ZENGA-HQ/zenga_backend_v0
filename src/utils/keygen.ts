// Generate and deploy a real ArgentX account (Starknet)
// Add these imports at the top of keygen.ts
import { Keypair as StellarKeypair } from '@stellar/stellar-sdk';
import { 
  cryptoWaitReady, 
  mnemonicGenerate, 
  mnemonicToMiniSecret, 
  encodeAddress, 
  decodeAddress 
} from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/keyring';
import { Wallet as EthWallet } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
import { Keypair as SolKeypair } from "@solana/web3.js";
import { Account, ec, stark, RpcProvider, hash, CallData } from "starknet";

import crypto from "crypto";
// import { utils } from "elliptic";

interface UsdcWalletInfo {
  address: string;
  privateKey: string;
  publicKey?: string; // Optional, included for Starknet/EVM
  note?: string; // Helpful for your app/users
}

interface GeneratedUsdcWallet {
  evm: UsdcWalletInfo; // Covers Ethereum + all EVM L2s (same address)
  solana: UsdcWalletInfo;
  starknet: UsdcWalletInfo;
}

interface NetworkWalletInfo {
  address: string;
  privateKey: string;
  publicKey: string;
  classHash: string;
  accountType: string;
}

interface GeneratedWallet {
  mainnet: NetworkWalletInfo;
  testnet: NetworkWalletInfo;
}

const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY?.padEnd(32, "0").slice(0, 32) ||
  "ZENGA_default_32_byte_key_123456789012"; // fallback string
const ALGORITHM = "aes-256-cbc";

// Derive a fixed 32-byte key from the ENCRYPTION_KEY using SHA-256.
// This guarantees a valid 32-byte Buffer for AES-256 regardless of the
// environment variable length or characters.
const KEY_BUFFER = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}
export function decrypt(text: string): string {
  const [ivHex, encryptedHex] = text.split(":");
  const iv = Buffer.from(ivHex as string, "hex");
  const encryptedText = Buffer.from(encryptedHex as string, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString("utf8");
  // End of fil
}

/**
 * Generate wallets capable of receiving USDC on all Rhino.fi supported chains.
 * Production-ready: secure random keys, same structure as your other generators.
 * Addresses are identical on mainnet/testnet for these chains.
 */
export function generateUsdcWallet(): GeneratedUsdcWallet {
  // 1. EVM (Ethereum + all L2s like Arbitrum, Base, Optimism, Polygon, etc.)
  const evmWallet = EthWallet.createRandom();
  const evmInfo: UsdcWalletInfo = {
    address: evmWallet.address,
    privateKey: evmWallet.privateKey,
    publicKey: evmWallet.publicKey,
    note: "USDC (ERC-20) - usable on Ethereum, Arbitrum, Base, Optimism, Polygon, Linea, Scroll, zkSync Era, etc.",
  };

  // 2. Solana
  const solKeypair = SolKeypair.generate();
  const solAddress = solKeypair.publicKey.toBase58();
  const solInfo: UsdcWalletInfo = {
    address: solAddress,
    privateKey: Buffer.from(solKeypair.secretKey).toString("hex"),
    note: "USDC (SPL) - most wallets auto-create Associated Token Account on receive.",
  };

  // 3. Starknet (matches your generateStrkWallet style)
  const starkPrivateKey = stark.randomAddress(); // Secure random private key
  const starkPublicKey = ec.starkCurve.getStarkKey(starkPrivateKey);
  const starkInfo: UsdcWalletInfo = {
    address: starkPublicKey, // Starknet uses public key as address for OZ accounts
    privateKey: starkPrivateKey,
    publicKey: starkPublicKey,
    note: "USDC on Starknet - compatible with Argent X / Braavos wallets.",
  };

  return {
    evm: evmInfo,
    solana: solInfo,
    starknet: starkInfo,
  };
}

export function generateEthWallet() {
  const wallet = EthWallet.createRandom();
  return {
    mainnet: { address: wallet.address, privateKey: wallet.privateKey },
    testnet: { address: wallet.address, privateKey: wallet.privateKey }, // Same address for both networks
  };
}

export function generateBtcWallet() {
  const ECPair = ECPairFactory(ecc);
  const keyPair = ECPair.makeRandom();

  // Mainnet (P2PKH)
  const mainnetAddress = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: bitcoin.networks.bitcoin,
  });

  // Testnet (P2PKH)
  const testnetAddress = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(keyPair.publicKey),
    network: bitcoin.networks.testnet,
  });

  return {
    mainnet: {
      address: mainnetAddress.address!,
      privateKey: keyPair.toWIF(),
    },
    testnet: {
      address: testnetAddress.address!,
      privateKey: keyPair.privateKey
        ? Buffer.from(keyPair.privateKey).toString("hex")
        : "",
    },
  };
}

export function generateSolWallet() {
  const keypair = SolKeypair.generate();
  const address = keypair.publicKey.toBase58();
  const privateKey = Buffer.from(keypair.secretKey).toString("hex");

  return {
    mainnet: { address, privateKey }, // Solana uses same address for mainnet
    testnet: { address, privateKey }, // and devnet/testnet
  };
}

export function generateStellarWallet() {
  // Always generate a valid Stellar ed25519 keypair.
  // Prefer `stellar-sdk` Keypair if available (returns StrKey encoded values).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // const { Keypair: StellarKeypair } = require("@stellar/stellar-sdk");
    const pair = StellarKeypair.random();
    return {
      mainnet: { address: pair.publicKey(), privateKey: pair.secret() },
      testnet: { address: pair.publicKey(), privateKey: pair.secret() },
    };
  } catch (err) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      // const { Keypair: StellarKeypair } = require("stellar-sdk");
      const pair = StellarKeypair.random();
      return {
        mainnet: { address: pair.publicKey(), privateKey: pair.secret() },
        testnet: { address: pair.publicKey(), privateKey: pair.secret() },
      };
    } catch (errLegacy) {
      // Fall through to manual fallback
    }
    // Fallback: generate ed25519 keys and encode to Stellar StrKey format
    // without adding external deps. This implements the minimal StrKey
    // encoder (version byte + payload + CRC16-XModem) + base32.

    // Generate ed25519 keypair using Node's crypto (available in modern Node versions)
    // If crypto.generateKeyPairSync isn't available for ed25519, fall back to
    // using a simple deterministic approach (not ideal) — but most envs have it.
    try {
      // Create ed25519 keypair
      // Node's CSR/KeyObject API returns PEM/DER; we'll use raw keys via generateKeyPairSync
      // which supports 'ed25519' and returns Buffer for private/public when format='der' + type
      // However Node's support for `privateKey.export({ format: 'der', type: 'pkcs8' })` is stable.
      const { generateKeyPairSync } = require("crypto");
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");

      // Export raw public/private key bytes (SubjectPublicKeyInfo / PKCS8 -> extract raw)
      // Node 12+ supports export with format 'der' and 'spki'/'pkcs8' types.
      const pubDer = publicKey.export({ type: "spki", format: "der" });
      const privDer = privateKey.export({ type: "pkcs8", format: "der" });

      // Extract raw bytes from DER structures by slicing standard headers.
      // For ed25519 spki, the public key raw bytes are the last 32 bytes.
      const pubRaw = pubDer.slice(-32);
      // For pkcs8, the private key raw seed is typically the last 34 bytes where the last 32 are the seed
      const privRaw = privDer.slice(-32);

      const publicKeyBytes: Buffer = Buffer.from(pubRaw);
      const privateKeyBytes: Buffer = Buffer.from(privRaw);

      // StrKey (Stellar) encoding helpers
      const base32 = (buf: Buffer) => {
        // RFC4648 base32 (no padding) using built-in Buffer -> base64 isn't suitable
        const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let bits = 0;
        let value = 0;
        let output = "";
        for (let i = 0; i < buf.length; i++) {
          value = (value << 8) | buf[i]!;
          bits += 8;
          while (bits >= 5) {
            output += ALPHABET[(value >>> (bits - 5)) & 31]!;
            bits -= 5;
          }
        }
        if (bits > 0) {
          output += ALPHABET[(value << (5 - bits)) & 31]!;
        }
        return output;
      };

      const crc16xmodem = (data: Buffer) => {
        let crc = 0x0000;
        for (let offset = 0; offset < data.length; offset++) {
          crc ^= (data[offset]! & 0xff) << 8;
          for (let bit = 0; bit < 8; bit++) {
            if ((crc & 0x8000) !== 0) {
              crc = (crc << 1) ^ 0x1021;
            } else {
              crc <<= 1;
            }
            crc &= 0xffff;
          }
        }
        return crc;
      };

      const encodeStrKey = (versionByte: number, payload: Buffer) => {
        const versionBuf = Buffer.from([versionByte]);
        const data = Buffer.concat([versionBuf, payload]);
        const crc = crc16xmodem(data);
        const crcBuf = Buffer.alloc(2);
        crcBuf.writeUInt16LE(crc, 0);
        const toEncode = Buffer.concat([data, crcBuf]);
        return base32(toEncode);
      };

      // Stellar version bytes: 6 << 3 = 48 for account ID (public key), 18 << 3 = 144 for seed
      const VERSION_BYTE_ACCOUNT_ID = 6 << 3; // G...
      const VERSION_BYTE_SEED = 18 << 3; // S...

      const publicStr = encodeStrKey(VERSION_BYTE_ACCOUNT_ID, publicKeyBytes);
      const privateStr = encodeStrKey(VERSION_BYTE_SEED, privateKeyBytes);

      // Pad with 'G'/'S' prefixes by reconstructing full StrKey: base32 output needs to be
      // converted to canonical representation. The minimal implementation above yields correct
      // base32 characters but Stellar's StrKey uses RFC4648 with padding removed and prefixes
      // 'G' for account and 'S' for seed are implicit in version byte. To match expectation
      // for readability, prefix the result with nothing because version byte already encodes.

      return {
        mainnet: { address: publicStr, privateKey: privateStr },
        testnet: { address: publicStr, privateKey: privateStr },
      };
    } catch (err2) {
      console.warn("Failed to generate Stellar keys in fallback:", err2);
      return {
        mainnet: { address: "", privateKey: "" },
        testnet: { address: "", privateKey: "" },
      };
    }
  }
}


export async function generatePolkadotWallet() {
  try {
    // Ensure WASM crypto initialized
    await cryptoWaitReady();

    // Generate mnemonic (12 words)
    const mnemonic = mnemonicGenerate(12);

    // Generate seed from mnemonic
    const seed = mnemonicToMiniSecret(mnemonic);

    // Create keyring with sr25519 (Polkadot standard)
    const keyring = new Keyring({ type: "sr25519", ss58Format: 0 });
    const pair = keyring.addFromSeed(seed);

    // Get the public key
    const publicKey = pair.publicKey;

    // Both mainnet and testnet use format 0
    const mainnetAddress = encodeAddress(publicKey, 0);
    const paseoAddress = encodeAddress(publicKey, 0);

    // Store complete key information
    const privateKeyData = {
      seed: Buffer.from(seed).toString("hex"),
      mnemonic: mnemonic, // CRITICAL for recovery
      type: "sr25519",
      publicKey: Buffer.from(publicKey).toString("hex"),
    };

    const privateKey = JSON.stringify(privateKeyData);

    return {
      mainnet: {
        address: mainnetAddress,
        privateKey: privateKey,
        network: "polkadot",
        format: 0,
      },
      testnet: {
        address: paseoAddress,
        privateKey: privateKey,
        network: "paseo",
        format: 0,
      },
      mnemonic,
      publicKey: Buffer.from(publicKey).toString("hex"),
    };
  } catch (err) {
    console.error("Polkadot wallet generation error:", err);
    return {
      mainnet: { address: "", privateKey: "", network: "", format: 0 },
      testnet: { address: "", privateKey: "", network: "", format: 0 },
      mnemonic: "",
      publicKey: "",
    };
  }
}

/**
 * Helper function to recover Polkadot wallet from stored privateKey
 */
export async function recoverPolkadotWallet(privateKeyJson: string) {
  try {
    await cryptoWaitReady();
    const keyData = JSON.parse(privateKeyJson);

    if (keyData.mnemonic) {
      const seed = mnemonicToMiniSecret(keyData.mnemonic);
      const keyring = new Keyring({ type: keyData.type || "sr25519" });
      return keyring.addFromSeed(seed);
    }

    if (keyData.seed) {
      const seedBuffer = Buffer.from(keyData.seed, "hex");
      const keyring = new Keyring({ type: keyData.type || "sr25519" });
      return keyring.addFromSeed(seedBuffer);
    }

    throw new Error("No valid recovery data found");
  } catch (err) {
    console.error("Failed to recover Polkadot wallet:", err);
    throw err;
  }
}

/**
 * Helper to check if an address is valid for Paseo
 */
export function validatePaseoAddress(address: string): boolean {
  try {
    const decoded = decodeAddress(address);
    return decoded && decoded.length === 32;
  } catch {
    return false;
  }
}
/**
 * Generate Starknet wallet for both mainnet and testnet
 */
export function generateStrkWallet(customPrivateKey?: string): GeneratedWallet {
  const privateKey = customPrivateKey || stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  const classHash =
    "0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688";

  const constructorCallData = CallData.compile({ publicKey });
  let address = hash.calculateContractAddressFromHash(
    publicKey,
    classHash,
    constructorCallData,
    0
  );

  // Ensure address is properly padded to 66 characters (0x + 64 hex chars)
  address = address.startsWith("0x")
    ? "0x" + address.slice(2).padStart(64, "0")
    : address;

  return {
    mainnet: {
      address,
      privateKey,
      publicKey,
      classHash,
      accountType: "OpenZeppelin",
    },
    testnet: {
      address,
      privateKey,
      publicKey,
      classHash,
      accountType: "OpenZeppelin",
    },
  };
}

export async function checkBalance(
  provider: RpcProvider,
  address: string,
  minBalance: bigint = BigInt("500000000000000000"), // 0.5 STRK minimum for deployment
  preferStrk: boolean = true // Prefer STRK over ETH
): Promise<{
  balance: bigint;
  hasSufficientFunds: boolean;
  token: "STRK" | "ETH";
}> {
  console.log("[DEBUG] checkBalance called - VERSION 2.0 with latest block");

  const ethTokenAddress =
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
  const strkTokenAddress =
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

  // Pad the address to 66 characters (0x + 64 hex chars) for proper Starknet format
  const paddedAddress = address.startsWith("0x")
    ? "0x" + address.slice(2).padStart(64, "0")
    : address;

  console.log(`[DEBUG] Checking balance for address: ${address}`);
  console.log(`[DEBUG] Padded address: ${paddedAddress}`);

  try {
    // Check STRK token balance first if preferred
    // Use 'latest' block identifier like in getMainnetBalances
    const strkRes = await provider.callContract(
      {
        contractAddress: strkTokenAddress,
        entrypoint: "balanceOf",
        calldata: [paddedAddress],
      },
      "latest"
    ); // Use 'latest' instead of 'pending'

    const strkBalance = BigInt(strkRes && strkRes[0] ? strkRes[0] : "0");

    console.log(
      `[DEBUG] STRK Balance for ${address}: ${strkBalance} wei (${
        Number(strkBalance) / 1e18
      } STRK)`
    );

    // If STRK balance is sufficient and preferred, use STRK
    if (preferStrk && strkBalance >= minBalance) {
      console.log(`[DEBUG] ✅ Sufficient STRK balance for deployment`);
      console.log(
        `[DEBUG] Has: ${Number(strkBalance) / 1e18} STRK, Needs: ${
          Number(minBalance) / 1e18
        } STRK`
      );
      return { balance: strkBalance, hasSufficientFunds: true, token: "STRK" };
    }

    // Fallback to ETH if STRK is insufficient or not preferred
    const ethRes = await provider.callContract(
      {
        contractAddress: ethTokenAddress,
        entrypoint: "balanceOf",
        calldata: [paddedAddress],
      },
      "latest"
    ); // Use 'latest' instead of 'pending'

    const ethBalance = BigInt(ethRes && ethRes[0] ? ethRes[0] : "0");

    console.log(
      `[DEBUG] ETH Balance for ${address}: ${ethBalance} wei (${
        Number(ethBalance) / 1e18
      } ETH)`
    );

    // Check if ETH is sufficient
    if (ethBalance >= minBalance) {
      console.log(`[DEBUG] ✅ Sufficient ETH balance for deployment`);
      return { balance: ethBalance, hasSufficientFunds: true, token: "ETH" };
    }

    // Neither is sufficient
    console.log(`[WARNING] ❌ Insufficient balance for deployment`);
    console.log(
      `  - STRK: ${Number(strkBalance) / 1e18} (need ${
        Number(minBalance) / 1e18
      })`
    );
    console.log(
      `  - ETH: ${Number(ethBalance) / 1e18} (need ${
        Number(minBalance) / 1e18
      })`
    );

    // Return STRK balance if preferred, otherwise ETH
    if (preferStrk) {
      return { balance: strkBalance, hasSufficientFunds: false, token: "STRK" };
    }
    return { balance: ethBalance, hasSufficientFunds: false, token: "ETH" };
  } catch (err: any) {
    console.error("checkBalance error:", err?.message || err);
    return { balance: BigInt(0), hasSufficientFunds: false, token: "STRK" };
  }
}

/**
 * Deploy Starknet wallet
 */
export async function deployStrkWallet(
  provider: RpcProvider,
  privateKey: string,
  publicKey: string,
  address: string,
  checkBalanceFirst: boolean = true
): Promise<{
  account: Account;
  transactionHash: string;
  contractAddress: string;
}> {
  // Check if already deployed
  try {
    await provider.getClassHashAt(address);
    console.log("Account already deployed");
    return {
      account: new (Account as any)(provider, address, privateKey),
      transactionHash: "",
      contractAddress: "",
    };
  } catch {}

  // Check balance if required
  if (checkBalanceFirst) {
    const { hasSufficientFunds } = await checkBalance(provider, address);
    if (!hasSufficientFunds) {
      throw new Error("Insufficient funds for deployment");
    }
  }

  const classHash =
    "0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688";
  const constructorCallData = CallData.compile({ publicKey });
  const account = new (Account as any)(provider, address, privateKey);

  // conservative fee (hex) used in fallback attempts
  const explicitMaxFee = "0xDE0B6B3A7640000"; // 1e18

  try {
    const { transaction_hash, contract_address } = await account.deployAccount({
      classHash,
      constructorCalldata: constructorCallData,
      addressSalt: publicKey,
    });

    await provider.waitForTransaction(transaction_hash);
    console.log("Account deployed:", contract_address);

    return {
      account,
      transactionHash: transaction_hash,
      contractAddress: contract_address,
    };
  } catch (err: any) {
    console.error(
      "deployStrkWallet primary deploy error:",
      err?.message || err
    );

    // Fallback: some RPC nodes report a specification version that the library
    // cannot negotiate for fee suggestion. In that case, retry deploy with an
    // explicit maxFee to avoid calling getUniversalSuggestedFee.
    const msg = String(err?.message || "").toLowerCase();
    if (
      msg.includes("specification version") ||
      msg.includes("spec version") ||
      msg.includes("connected node specification") ||
      msg.includes("rpc081")
    ) {
      try {
        console.log(
          "[FALLBACK] Attempting deploy with explicit maxFee to bypass fee suggestion"
        );
        // conservative fee (hex) - large value to be safe; units are in wei-like on Starknet
        const explicitMaxFee = "0xDE0B6B3A7640000"; // 1e18

        const { transaction_hash, contract_address } =
          await account.deployAccount({
            classHash,
            constructorCalldata: constructorCallData,
            addressSalt: publicKey,
            maxFee: explicitMaxFee,
          } as any);

        await provider.waitForTransaction(transaction_hash);
        console.log(
          "[FALLBACK] Account deployed (fallback):",
          contract_address
        );

        return {
          account,
          transactionHash: transaction_hash,
          contractAddress: contract_address,
        };
      } catch (err2: any) {
        console.error("[FALLBACK] Deploy failed:", err2?.message || err2);

        // If the failure was caused by an incompatible RPC channel spec (RPC081)
        // try switching the provider endpoint to a v0_8 path and retrying.
        const origUrl =
          (provider as any)?.nodeUrl || (provider as any)?.baseUrl || "";
        try {
          if (origUrl && typeof origUrl === "string") {
            let fallbackUrl = "";
            if (origUrl.includes("/v0_9/")) {
              fallbackUrl = origUrl.replace("/v0_9/", "/v0_8/");
            } else if (origUrl.includes("/v0_8/")) {
              fallbackUrl = origUrl.replace(
                "/v0_8/",
                "/starknet/version/rpc/v0_9/"
              );
            }

            if (fallbackUrl) {
              console.log(
                "[FALLBACK] Trying provider with fallback URL:",
                fallbackUrl
              );
              const newProvider = new RpcProvider({ nodeUrl: fallbackUrl });
              const fallbackAccount = new (Account as any)(
                newProvider,
                address,
                privateKey
              );
              try {
                const fee = explicitMaxFee;
                const r = await fallbackAccount.deployAccount({
                  classHash,
                  constructorCalldata: constructorCallData,
                  addressSalt: publicKey,
                  maxFee: fee,
                } as any);
                await newProvider.waitForTransaction(r.transaction_hash);
                console.log(
                  "[FALLBACK] Account deployed with fallback provider:",
                  r.contract_address
                );
                return {
                  account: fallbackAccount,
                  transactionHash: r.transaction_hash,
                  contractAddress: r.contract_address,
                };
              } catch (err3: any) {
                console.error(
                  "[FALLBACK] Deploy with fallback provider failed:",
                  (err3 as any)?.message || err3
                );
                throw err3;
              }
            }
          }
        } catch (finalErr) {
          console.error(
            "[FALLBACK] Final deploy attempt failed:",
            (finalErr as any)?.message || finalErr
          );
        }

        throw err2;
      }
    }

    throw err;
  }
}
