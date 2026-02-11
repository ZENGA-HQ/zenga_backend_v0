import { Request, Response } from "express";
import { AppDataSource } from "../config/database";
import { User, UserType } from "../entities/User";
import { Company } from "../entities/Company";
import { RefreshToken } from "../entities/RefreshToken";
import { AuthRequest } from "../types";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { generateOTP, getOTPExpiry, isOTPExpired } from "../utils/otp";
import { sendMailtrapMail } from "../utils/mailtrap";
import { resendOtpTemplate } from "../utils/resendOtpTemplate";
import {
  passwordResetRequestTemplate,
  passwordResetRequestText,
  passwordChangedTemplate,
  passwordChangedText,
} from "../utils/passwordResetTemplates";
import {
  encrypt,
  generateEthWallet,
  generateBtcWallet,
  generateSolWallet,
  generateStrkWallet,
  generateStellarWallet,
  generatePolkadotWallet,
  generateUsdcWallet,
} from "../utils/keygen";
import axios from "axios";
import bcrypt from "bcryptjs";
import {
  createUserIfNotExists,
  saveUserAddresses,
} from "../services/userService";
import { sendRegistrationEmails } from "../services/emailService";
import { NotificationService } from "../services/notificationService";
import { UserAddress } from "../entities/UserAddress";
import { NetworkType, NotificationType } from "../types";
import { ChainType } from "../types";

export class AuthController {
  /**
   * Delete a user by ID (from route param).
   * Expects 'id' as req.params.id.
   * Responds with success or error if not found.
   */
  static async deleteUserById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = typeof id === "string" ? id : id?.[0];
      if (!userId) {
        res.status(400).json({
          error: "User ID required in URL param",
        });
        return;
      }
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: userId },
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      await userRepository.remove(user);
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
  /**
   * Register a new user.
   * - Checks if the user already exists by email.
   * - Creates a new user and saves to the database.
   * - Generates wallets for ETH, BTC, SOL, STRK and encrypts their private keys.
   * - Stores all addresses in the UserAddress table.
   * - Generates and saves an OTP for email verification.
   * - (Email sending is commented out, but logs OTP to console.)
   * - Returns the user ID and addresses (without private keys).
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, userType, companyName, companyCode } = req.body;

      // Generate OTP early to ensure it's saved with the user
      const otp = generateOTP();
      const otpExpiry = getOTPExpiry();

      let targetUserType = UserType.INDIVIDUAL;
      let companyId: string | undefined;

      console.log(
        `[DEBUG] Registration started for: ${email}, type: ${userType}`,
      );

      let companyCodeValue: string | undefined;
      if (userType === "company") {
        if (!companyName) {
          res.status(400).json({ error: "Company name is required" });
          return;
        }
        targetUserType = UserType.COMPANY;

        const companyRepo = AppDataSource.getRepository(Company);
        const company = companyRepo.create({
          companyName,
          companyEmail: email,
        });
        await companyRepo.save(company);
        companyId = company.id;
        companyCodeValue = company.companyCode;
        console.log(
          `[DEBUG] Company created with ID: ${companyId}, Code: ${company.companyCode}`,
        );
      } else if (userType === "employee") {
        if (!companyCode) {
          res.status(400).json({ error: "Company code is required" });
          return;
        }
        targetUserType = UserType.EMPLOYEE;

        const companyRepo = AppDataSource.getRepository(Company);
        const company = await companyRepo.findOne({ where: { companyCode } });
        if (!company) {
          res.status(404).json({ error: "Invalid company code" });
          return;
        }
        companyId = company.id;
        console.log(
          `[DEBUG] Found company: ${company.companyName} with ID: ${companyId}`,
        );
      }

      // Create user if not exists with OTP pre-populated
      console.log(`[DEBUG] Creating user: ${email}`);
      const user = await createUserIfNotExists(
        email,
        password,
        targetUserType,
        companyId,
        otp,
        otpExpiry,
      );
      if (!user) {
        console.log(
          `[DEBUG] Registration failed: User ${email} already exists`,
        );
        res.status(409).json({ error: "User already exists" });
        return;
      }
      console.log(`[DEBUG] User created with ID: ${user.id}, OTP: ${otp}`);

      // ===== ENHANCED WALLET GENERATION WITH VALIDATION =====
      console.log(`[DEBUG] Generating wallets for: ${user.id}`);
      
      const eth = generateEthWallet();
      console.log('[DEBUG] ✅ ETH wallet generated:', eth.mainnet.address);
      
      const btc = generateBtcWallet();
      console.log('[DEBUG] ✅ BTC wallet generated:', btc.mainnet.address);
      
      const sol = generateSolWallet();
      console.log('[DEBUG] ✅ SOL wallet generated:', sol.mainnet.address);
      
      // CRITICAL: Test Stellar generation
      const stellar = generateStellarWallet();
      console.log('[DEBUG] Stellar wallet generation result:', {
        mainnetAddress: stellar.mainnet.address,
        testnetAddress: stellar.testnet.address,
        hasMainnetAddress: !!stellar.mainnet.address,
        hasPrivateKey: !!stellar.mainnet.privateKey,
        addressLength: stellar.mainnet.address?.length || 0
      });
      
      if (!stellar.mainnet.address) {
        console.error('[ERROR] ❌ Stellar wallet generation FAILED - empty address!');
        console.error('[ERROR] Please install: npm install @stellar/stellar-sdk');
      } else {
        console.log('[DEBUG] ✅ Stellar wallet generated:', stellar.mainnet.address);
      }
      
      // CRITICAL: Test Polkadot generation
      const polkadot = await generatePolkadotWallet();
      console.log('[DEBUG] Polkadot wallet generation result:', {
        mainnetAddress: polkadot.mainnet.address,
        testnetAddress: polkadot.testnet.address,
        hasMainnetAddress: !!polkadot.mainnet.address,
        hasPrivateKey: !!polkadot.mainnet.privateKey,
        mnemonic: polkadot.mnemonic ? '[PRESENT]' : '[MISSING]',
        addressLength: polkadot.mainnet.address?.length || 0
      });
      
      if (!polkadot.mainnet.address) {
        console.error('[ERROR] ❌ Polkadot wallet generation FAILED - empty address!');
        console.error('[ERROR] Please install: npm install @polkadot/util-crypto @polkadot/keyring');
      } else {
        console.log('[DEBUG] ✅ Polkadot wallet generated:', polkadot.mainnet.address);
      }
      
      const strk = generateStrkWallet();
      console.log('[DEBUG] ✅ STRK wallet generated:', strk.mainnet.address);
      
      const usdcWallets = generateUsdcWallet();
      console.log('[DEBUG] ✅ USDC wallets generated');
      
      const tron = generateEthWallet();
      console.log('[DEBUG] ✅ Tron wallet generated');

      // Prepare addresses array for saving and response
      const fullAddresses = [
        {
          chain: "ethereum",
          network: "mainnet",
          address: eth.mainnet.address,
          encryptedPrivateKey: encrypt(eth.mainnet.privateKey),
        },
        {
          chain: "ethereum",
          network: "testnet",
          address: eth.testnet.address,
          encryptedPrivateKey: encrypt(eth.testnet.privateKey),
        },
        {
          chain: "bitcoin",
          network: "mainnet",
          address: btc.mainnet.address,
          encryptedPrivateKey: encrypt(btc.mainnet.privateKey),
        },
        {
          chain: "bitcoin",
          network: "testnet",
          address: btc.testnet.address,
          encryptedPrivateKey: encrypt(btc.testnet.privateKey),
        },
        {
          chain: "solana",
          network: "mainnet",
          address: sol.mainnet.address,
          encryptedPrivateKey: encrypt(sol.mainnet.privateKey),
        },
        {
          chain: "solana",
          network: "testnet",
          address: sol.testnet.address,
          encryptedPrivateKey: encrypt(sol.testnet.privateKey),
        },
        {
          chain: "starknet",
          network: "mainnet",
          address: strk.mainnet.address,
          encryptedPrivateKey: encrypt(strk.mainnet.privateKey),
        },
        {
          chain: "starknet",
          network: "testnet",
          address: strk.testnet.address,
          encryptedPrivateKey: encrypt(strk.testnet.privateKey),
        },
        // USDT addresses
        {
          chain: "usdt_erc20",
          network: "mainnet",
          address: eth.mainnet.address,
          encryptedPrivateKey: encrypt(eth.mainnet.privateKey),
        },
        {
          chain: "usdt_erc20",
          network: "testnet",
          address: eth.testnet.address,
          encryptedPrivateKey: encrypt(eth.testnet.privateKey),
        },
        {
          chain: "usdt_trc20",
          network: "mainnet",
          address: tron.mainnet.address,
          encryptedPrivateKey: encrypt(tron.mainnet.privateKey),
        },
        {
          chain: "usdt_trc20",
          network: "testnet",
          address: tron.testnet.address,
          encryptedPrivateKey: encrypt(tron.testnet.privateKey),
        },
        // Stellar - VALIDATE BEFORE ADDING
        {
          chain: "stellar",
          network: "mainnet",
          address: stellar.mainnet.address,
          encryptedPrivateKey: stellar.mainnet.privateKey ? encrypt(stellar.mainnet.privateKey) : "",
        },
        {
          chain: "stellar",
          network: "testnet",
          address: stellar.testnet.address,
          encryptedPrivateKey: stellar.testnet.privateKey ? encrypt(stellar.testnet.privateKey) : "",
        },
        // Polkadot - VALIDATE BEFORE ADDING
        {
          chain: "polkadot",
          network: "mainnet",
          address: polkadot.mainnet.address,
          encryptedPrivateKey: polkadot.mainnet.privateKey ? encrypt(polkadot.mainnet.privateKey) : "",
        },
        {
          chain: "polkadot",
          network: "testnet",
          address: polkadot.testnet.address,
          encryptedPrivateKey: polkadot.testnet.privateKey ? encrypt(polkadot.testnet.privateKey) : "",
        },
        {
          chain: "usdc-evm",
          network: "mainnet",
          address: usdcWallets.evm.address,
          encryptedPrivateKey: encrypt(usdcWallets.evm.privateKey),
          note: "USDC on Ethereum, Arbitrum, Base, Optimism, Polygon, Linea, Scroll, zkSync Era, Avalanche, Mantle, etc.",
        },
        {
          chain: "usdc-solana",
          network: "mainnet",
          address: usdcWallets.solana.address,
          encryptedPrivateKey: encrypt(usdcWallets.solana.privateKey),
          note: "USDC (SPL) on Solana - ATA created automatically on receive",
        },
        {
          chain: "usdc-starknet",
          network: "mainnet",
          address: usdcWallets.starknet.address,
          encryptedPrivateKey: encrypt(usdcWallets.starknet.privateKey),
          note: "USDC on Starknet - requires account deployment if new",
        },
      ];

      // ===== ENHANCED DATABASE SAVE WITH VALIDATION =====
      console.log(
        `[DEBUG] Saving ${fullAddresses.length} addresses for user: ${user.id}`,
      );
      
      const addressRepo = AppDataSource.getRepository(UserAddress);
      let savedCount = 0;
      let skippedCount = 0;
      
      for (const addr of fullAddresses) {
        try {
          // VALIDATE: Skip empty addresses
          if (!addr.address || addr.address.trim() === '') {
            console.warn(`[WARN] ⚠️ Skipping empty address for chain ${addr.chain}/${addr.network}`);
            skippedCount++;
            continue;
          }
          
          // VALIDATE: Check ChainType enum exists
          const chainKey = addr.chain.toUpperCase().replace(/-/g, '_');
          if (!ChainType[chainKey as keyof typeof ChainType]) {
            console.error(`[ERROR] ❌ Unknown ChainType: ${chainKey}`);
            console.log('[DEBUG] Available ChainType keys:', Object.keys(ChainType));
            skippedCount++;
            continue;
          }
          
          // VALIDATE: Check NetworkType enum exists
          const networkKey = addr.network.toUpperCase();
          if (!NetworkType[networkKey as keyof typeof NetworkType]) {
            console.error(`[ERROR] ❌ Unknown NetworkType: ${networkKey}`);
            console.log('[DEBUG] Available NetworkType keys:', Object.keys(NetworkType));
            skippedCount++;
            continue;
          }
          
          await addressRepo.save({
            address: addr.address,
            encryptedPrivateKey: addr.encryptedPrivateKey,
            user,
            userId: user.id!,
            chain: ChainType[chainKey as keyof typeof ChainType],
            network: NetworkType[networkKey as keyof typeof NetworkType],
          });
          
          savedCount++;
          console.log(`[DEBUG] ✅ Saved ${addr.chain}/${addr.network}:`, addr.address.substring(0, 20) + '...');
        } catch (err) {
          console.error(`[ERROR] ❌ Failed to save address ${addr.chain}/${addr.network}:`, err);
          skippedCount++;
        }
      }
      
      console.log(`[DEBUG] Address save complete: ${savedCount} saved, ${skippedCount} skipped`);

      console.log(`\n========================================`);
      console.log(`📧 REGISTRATION OTP`);
      console.log(`Email: ${email}`);
      console.log(`OTP Code: ${otp}`);
      console.log(`Expires: ${otpExpiry.toISOString()}`);
      console.log(`========================================\n`);

      // Create registration notification
      try {
        if (user.id) {
          await NotificationService.notifyRegistration(user.id, {
            email,
            registrationDate: new Date(),
            addressCount: fullAddresses.length,
            otp,
          });
          console.log(
            "[DEBUG] Registration notification created for user:",
            user.id,
          );
        }
      } catch (notificationError) {
        console.error(
          "[DEBUG] Failed to create registration notification:",
          notificationError,
        );
        // Don't fail registration if notification fails
      }

      // Return user profile with addresses (no private keys)
      const userAddresses = fullAddresses
        .filter(a => a.address && a.address.trim() !== '') // Only include valid addresses
        .map((a: any) => ({
          chain: AuthController.mapChainName(a.chain),
          network: a.network,
          address: a.address,
        }));
        
      // Sort addresses before sending
      const sortedAddresses = AuthController.sortAddresses(userAddresses);

      console.log(
        "[DEBUG] Sorted addresses:",
        JSON.stringify(sortedAddresses, null, 2),
      );

      res.status(201).json({
        message: "User registered successfully. Please verify your email.",
        userId: user.id,
        role: targetUserType,
        companyName: companyName,
        companyCode: companyCodeValue,
        addresses: sortedAddresses,
        otp: otp,
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Login user.
   * - Finds user by email and checks password.
   * - Verifies email is confirmed.
   * - Generates JWT access and refresh tokens.
   * - Saves refresh token to the database.
   * - Returns tokens and basic user info.
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;
      const userRepository = AppDataSource.getRepository(User);
      const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

      // Find user by email with company details
      const user = await userRepository.findOne({
        where: { email },
        relations: ["company"],
      });
      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Check password using User entity's comparePassword method
      const isValidPassword = await user.comparePassword(password);
      if (!isValidPassword) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Ensure email is verified before allowing login
      if (!user.isEmailVerified) {
        res.status(403).json({
          error:
            "Email not verified. Please verify your email before logging in.",
        });
        return;
      }

      // Generate JWT tokens
      if (!user.id || !user.email) {
        res.status(500).json({ error: "User data incomplete" });
        return;
      }
      const payload = { userId: user.id, email: user.email };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // Save refresh token to DB for session management
      const refreshTokenEntity = refreshTokenRepository.create({
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
      await refreshTokenRepository.save(refreshTokenEntity);

      res.json({
        message: "Login successful",
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.userType,
          position: user.position,
          salary: user.salary,
          company: user.company
            ? {
              id: user.company.id,
              name: user.company.companyName,
              code: user.company.companyCode,
              email: user.company.companyEmail,
            }
            : null,
          isEmailVerified: user.isEmailVerified,
          hasTransactionPin: !!user.transactionPin,
        },
      });

      // After successful login, ensure user has Stellar and Polkadot addresses
      try {
        const addressRepo = AppDataSource.getRepository("UserAddress");
        const existing = await addressRepo.find({ where: { userId: user.id } });
        const chains = existing.map((e: any) => e.chain);
        const toCreate: any[] = [];
        if (!chains.includes("stellar")) {
          const stellar = generateStellarWallet();
          toCreate.push({
            chain: "stellar",
            network: "mainnet",
            address: stellar.mainnet.address,
            encryptedPrivateKey: encrypt(stellar.mainnet.privateKey),
            user,
            userId: user.id,
          });
        }
        if (!chains.includes("polkadot")) {
          const polkadot = await generatePolkadotWallet();
          toCreate.push({
            chain: "polkadot",
            network: "mainnet",
            address: polkadot.mainnet.address,
            encryptedPrivateKey: encrypt(polkadot.mainnet.privateKey),
            user,
            userId: user.id,
          });
        }
        if (toCreate.length) {
          for (const row of toCreate) {
            try {
              await addressRepo.save(row);
            } catch (err) {
              console.error("Failed to save generated address on login", err);
            }
          }
        }
      } catch (err) {
        console.error("Post-login address generation failed", err);
      }

      // Create login notification
      try {
        if (user.id) {
          await NotificationService.notifyLogin(user.id, {
            loginTime: new Date(),
            userAgent: req.headers["user-agent"],
            ip: req.ip || req.connection.remoteAddress,
          });
          console.log("[DEBUG] Login notification created for user:", user.id);
        }
      } catch (notificationError) {
        console.error(
          "[DEBUG] Failed to create login notification:",
          notificationError,
        );
        // Don't fail login if notification fails
      }
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Google Sign-in / Sign-up check
   * Expects either { idToken } (Google ID token) or { email } in the body.
   * If user exists -> issue JWTs and return user + tokens.
   * If user does NOT exist -> return { exists: false, email, name } so frontend can route to account creation.
   */
  static async googleSignIn(req: Request, res: Response): Promise<any> {
    try {
      const { idToken } = req.body as { idToken?: string };
      const code = req.body.code as string | undefined;

      // Minimal masking helper for logging
      const mask = (s?: string) => {
        if (!s) return "";
        if (s.length <= 12) return "***" + s.slice(-4);
        return `${s.slice(0, 8)}...${s.slice(-4)}`;
      };

      // Log incoming request for debugging (do not log full tokens in production)
      console.log("[AUTH][Google] Incoming request:", {
        time: new Date().toISOString(),
        ip:
          req.ip ||
          req.headers["x-forwarded-for"] ||
          req.connection?.remoteAddress,
        userAgent: req.get("User-Agent"),
        hasIdToken: !!idToken,
        idTokenPreview: mask(idToken),
        hasCode: !!code,
        codePreview: mask(code),
        bodyEmail: req.body.email,
      });
      let email: string | undefined = req.body.email;
      let emailVerified = false;
      let name: string | undefined;

      if (idToken) {
        // Verify ID token with Google
        try {
          const resp = await axios.get(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
              idToken,
            )}`,
          );
          const data = resp.data as any;
          email = data.email;
          // Google returns email_verified as string 'true' or boolean depending on endpoint
          emailVerified =
            data.email_verified === true || data.email_verified === "true";
          name = data.name;
          // Verify audience matches our client id
          const aud = data.aud || data.audience || data.client_id;
          const issuer = data.iss || data.issuer;
          const expectedAud = process.env.GOOGLE_CLIENT_ID;
          if (expectedAud && aud && expectedAud !== String(aud)) {
            console.error("[AUTH][Google] Token audience mismatch", {
              expectedAud,
              aud,
            });
            return res
              .status(400)
              .json({ error: "Invalid Google ID token (audience mismatch)" });
          }
          if (
            issuer &&
            issuer !== "accounts.google.com" &&
            issuer !== "https://accounts.google.com"
          ) {
            console.error("[AUTH][Google] Token issuer unexpected", issuer);
            return res
              .status(400)
              .json({ error: "Invalid Google ID token (issuer mismatch)" });
          }
        } catch (err: any) {
          console.error(
            "Failed to verify Google id_token:",
            err?.response?.data || err,
          );
          return res.status(400).json({ error: "Invalid Google ID token" });
        }
      }

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const userRepository = AppDataSource.getRepository(User);
      const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

      const user = await userRepository.findOne({ where: { email } });

      if (!user) {
        // User not found — do not auto-create here. Let the frontend route the user to signup.
        return res.json({ exists: false, email, name });
      }

      // Ensure user is available for downstream operations
      if (!user) {
        return res
          .status(500)
          .json({ error: "Failed to retrieve or create user" });
      }

      // If Google verified the email but our DB flag isn't set, mark it verified
      // If Google verified the email but our DB flag isn't set, mark it verified
      if (emailVerified && !user.isEmailVerified) {
        user.isEmailVerified = true;
      }

      // Only populate firstName/lastName from Google if the user hasn't set them previously.
      // This prevents overwriting user-updated profile fields with Google token values.
      if (name) {
        const parts = name.split(" ");
        const gFirst = parts.shift();
        const gLast = parts.join(" ");
        let shouldSave = false;
        if (!user.firstName && gFirst) {
          user.firstName = gFirst;
          shouldSave = true;
        }
        if (!user.lastName && gLast) {
          user.lastName = gLast;
          shouldSave = true;
        }
        if (shouldSave || (emailVerified && !user.isEmailVerified)) {
          await userRepository.save(user);
        }
      } else if (emailVerified && !user.isEmailVerified) {
        // No name to set but still need to persist email verification
        await userRepository.save(user);
      }

      // Issue tokens (same as login)
      if (!user.id || !user.email) {
        return res.status(500).json({ error: "User data incomplete" });
      }
      const userId = user.id;
      const payload = { userId, email: user.email };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // Save refresh token
      const refreshTokenEntity = refreshTokenRepository.create({
        token: refreshToken,
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await refreshTokenRepository.save(refreshTokenEntity);

      // Fetch full user profile (addresses, kyc) for consistent frontend shape
      const fullUser = await userRepository.findOne({
        where: { id: userId },
        relations: ["addresses", "kycDocument"],
      });
      return res.json({
        exists: true,
        accessToken,
        refreshToken,
        user: {
          id: fullUser!.id,
          email: fullUser!.email,
          firstName: fullUser!.firstName,
          lastName: fullUser!.lastName,
          phoneNumber: fullUser!.phoneNumber,
          username: fullUser!.username,
          displayPicture: fullUser!.displayPicture,
          isEmailVerified: fullUser!.isEmailVerified,
          hasTransactionPin: !!fullUser!.transactionPin,
          kycStatus: fullUser!.kycStatus,
          kyc: fullUser!.kycDocument,
          addresses: fullUser!.addresses,
          bankDetails: {
            bankName: fullUser!.bankName,
            accountNumber: fullUser!.accountNumber,
            accountName: fullUser!.accountName,
          },
          createdAt: fullUser!.createdAt,
        },
      });
    } catch (error) {
      console.error("Google sign-in error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Google Sign-up
   * - Verifies idToken with Google
   * - Ensures email_verified is true
   * - Creates a new user (if not exists) and generates wallets/addresses
   * - Issues access + refresh tokens and returns user + tokens
   */
  static async googleSignup(req: Request, res: Response): Promise<any> {
    try {
      const { idToken } = req.body as {
        idToken?: string;
        firstName?: string;
        lastName?: string;
      };

      if (!idToken) {
        return res.status(400).json({ error: "idToken is required" });
      }

      // Verify ID token with Google
      let email: string | undefined;
      let emailVerified = false;
      let name: string | undefined;
      try {
        const resp = await axios.get(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
            idToken,
          )}`,
        );
        const data = resp.data as any;
        email = data.email;
        emailVerified =
          data.email_verified === true || data.email_verified === "true";
        name = data.name;
        // Verify audience and issuer
        const aud = data.aud || data.audience || data.client_id;
        const issuer = data.iss || data.issuer;
        const expectedAud = process.env.GOOGLE_CLIENT_ID;
        if (expectedAud && aud && expectedAud !== String(aud)) {
          console.error("[AUTH][Google][Signup] Token audience mismatch", {
            expectedAud,
            aud,
          });
          return res
            .status(400)
            .json({ error: "Invalid Google ID token (audience mismatch)" });
        }
        if (
          issuer &&
          issuer !== "accounts.google.com" &&
          issuer !== "https://accounts.google.com"
        ) {
          console.error(
            "[AUTH][Google][Signup] Token issuer unexpected",
            issuer,
          );
          return res
            .status(400)
            .json({ error: "Invalid Google ID token (issuer mismatch)" });
        }
      } catch (err: any) {
        console.error(
          "Failed to verify Google id_token (signup):",
          err?.response?.data || err,
        );
        return res.status(400).json({ error: "Invalid Google ID token" });
      }

      if (!email) {
        return res
          .status(400)
          .json({ error: "Email not available from Google token" });
      }

      if (!emailVerified) {
        return res.status(400).json({ error: "Google email not verified" });
      }

      const userRepository = AppDataSource.getRepository(User);
      const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

      // Attempt to create user; if already exists, return conflict
      const randomPwd =
        Math.random().toString(36).slice(2, 12) +
        Date.now().toString(36).slice(-4);
      const created = await createUserIfNotExists(email, randomPwd);
      if (!created) {
        // User already exists
        return res.status(409).json({ error: "User already exists" });
      }

      // Set verified and names
      created.isEmailVerified = true;
      if (req.body.firstName) created.firstName = req.body.firstName;
      if (req.body.lastName) created.lastName = req.body.lastName;
      if (!created.firstName && name) {
        const parts = name.split(" ");
        created.firstName = parts.shift() as string;
        created.lastName = parts.join(" ");
      }
      await userRepository.save(created);

      // Generate wallets and addresses (same as register)
      try {
        const eth = generateEthWallet();
        const btc = generateBtcWallet();
        const sol = generateSolWallet();
        const stellar = generateStellarWallet();
        const polkadot = await generatePolkadotWallet();
        const strk = generateStrkWallet();
        const tron = generateEthWallet();
        const usdcWallets = generateUsdcWallet();

        const addresses = [
          {
            chain: "ethereum",
            network: "mainnet",
            address: eth.mainnet.address,
            encryptedPrivateKey: encrypt(eth.mainnet.privateKey),
          },
          {
            chain: "ethereum",
            network: "testnet",
            address: eth.testnet.address,
            encryptedPrivateKey: encrypt(eth.testnet.privateKey),
          },
          {
            chain: "bitcoin",
            network: "mainnet",
            address: btc.mainnet.address,
            encryptedPrivateKey: encrypt(btc.mainnet.privateKey),
          },
          {
            chain: "bitcoin",
            network: "testnet",
            address: btc.testnet.address,
            encryptedPrivateKey: encrypt(btc.testnet.privateKey),
          },
          {
            chain: "solana",
            network: "mainnet",
            address: sol.mainnet.address,
            encryptedPrivateKey: encrypt(sol.mainnet.privateKey),
          },
          {
            chain: "solana",
            network: "testnet",
            address: sol.testnet.address,
            encryptedPrivateKey: encrypt(sol.testnet.privateKey),
          },
          {
            chain: "starknet",
            network: "mainnet",
            address: strk.mainnet.address,
            encryptedPrivateKey: encrypt(strk.mainnet.privateKey),
          },
          {
            chain: "starknet",
            network: "testnet",
            address: strk.testnet.address,
            encryptedPrivateKey: encrypt(strk.testnet.privateKey),
          },
          {
            chain: "usdt_erc20",
            network: "mainnet",
            address: eth.mainnet.address,
            encryptedPrivateKey: encrypt(eth.mainnet.privateKey),
          },
          {
            chain: "usdt_erc20",
            network: "testnet",
            address: eth.testnet.address,
            encryptedPrivateKey: encrypt(eth.testnet.privateKey),
          },
          {
            chain: "usdt_trc20",
            network: "mainnet",
            address: tron.mainnet.address,
            encryptedPrivateKey: encrypt(tron.mainnet.privateKey),
          },
          {
            chain: "usdt_trc20",
            network: "testnet",
            address: tron.testnet.address,
            encryptedPrivateKey: encrypt(tron.testnet.privateKey),
          },
          {
            chain: "stellar",
            network: "mainnet",
            address: stellar.mainnet.address,
            encryptedPrivateKey: encrypt(stellar.mainnet.privateKey),
          },
          {
            chain: "stellar",
            network: "testnet",
            address: stellar.testnet.address,
            encryptedPrivateKey: encrypt(stellar.testnet.privateKey),
          },
          {
            chain: "polkadot",
            network: "mainnet",
            address: polkadot.mainnet.address,
            encryptedPrivateKey: encrypt(polkadot.mainnet.privateKey),
          },
          {
            chain: "polkadot",
            network: "testnet",
            address: polkadot.testnet.address,
            encryptedPrivateKey: encrypt(polkadot.testnet.privateKey),
          },
          {
            chain: "usdc-evm", // All EVM chains use the same address for USDC (ERC-20)
            network: "mainnet",
            address: usdcWallets.evm.address,
            encryptedPrivateKey: encrypt(usdcWallets.evm.privateKey),
            note: "USDC on Ethereum, Arbitrum, Base, Optimism, Polygon, Linea, Scroll, zkSync Era, Avalanche, Mantle, etc.",
          },
          {
            chain: "usdc-solana",
            network: "mainnet",
            address: usdcWallets.solana.address,
            encryptedPrivateKey: encrypt(usdcWallets.solana.privateKey),
            note: "USDC (SPL) on Solana - ATA created automatically on receive",
          },
          {
            chain: "usdc-starknet",
            network: "mainnet",
            address: usdcWallets.starknet.address,
            encryptedPrivateKey: encrypt(usdcWallets.starknet.privateKey),
            note: "USDC on Starknet - requires account deployment if new",
          },
        ];
        await saveUserAddresses(created, addresses);
        await NotificationService.notifyRegistration(created.id!, {
          email: created.email,
          registrationDate: new Date(),
          addressCount: addresses.length,
        }).catch((err) => console.error("notify reg failed", err));
      } catch (addrErr) {
        console.error(
          "Failed to generate wallets for google-signup user",
          addrErr,
        );
      }

      // Issue tokens
      if (!created.id || !created.email) {
        return res
          .status(500)
          .json({ error: "User data incomplete after creation" });
      }
      const createdId = created.id;
      const payload = { userId: createdId, email: created.email };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      const refreshTokenEntity = refreshTokenRepository.create({
        token: refreshToken,
        userId: createdId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await refreshTokenRepository.save(refreshTokenEntity);

      // Return full profile for consistency with other auth flows
      const createdFull = await userRepository.findOne({
        where: { id: createdId },
        relations: ["addresses", "kycDocument"],
      });
      return res.status(201).json({
        accessToken,
        refreshToken,
        user: {
          id: createdFull!.id,
          email: createdFull!.email,
          firstName: createdFull!.firstName,
          lastName: createdFull!.lastName,
          phoneNumber: createdFull!.phoneNumber,
          username: createdFull!.username,
          displayPicture: createdFull!.displayPicture,
          isEmailVerified: createdFull!.isEmailVerified,
          hasTransactionPin: !!createdFull!.transactionPin,
          kycStatus: createdFull!.kycStatus,
          kyc: createdFull!.kycDocument,
          addresses: createdFull!.addresses,
          bankDetails: {
            bankName: createdFull!.bankName,
            accountNumber: createdFull!.accountNumber,
            accountName: createdFull!.accountName,
          },
          createdAt: createdFull!.createdAt,
        },
      });
    } catch (error) {
      console.error("Google signup error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Verify OTP for email verification.
   * - Looks up user by email.
   * - Checks OTP and expiry.
   * - Marks email as verified if OTP is valid.
   * - Returns success or error.
   */
static async verifyOTP(req: Request, res: Response): Promise<any> {
  try {
    let { email, otp, code } = req.body;
    
    // Allow 'code' to be used alias for 'otp'
    if (!otp && code) otp = code;
    
    // ✅ FIX: Convert to string to handle both number and string inputs
    if (otp !== undefined && otp !== null) {
      otp = String(otp);
    }
    
    // ✅ FIX: Validate email first
    if (!email) {
      res.status(400).json({ error: "Email is required" });
      return;
    }
    
    // ✅ FIX: Validate OTP is provided
    if (!otp) {
      res.status(400).json({ error: "OTP is required" });
      return;
    }
    
    const userRepository = AppDataSource.getRepository(User);

    // Find user by email
    const user = await userRepository.findOne({ where: { email } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Ensure OTP and expiry are present
    if (!user.emailOTP || !user.emailOTPExpiry) {
      res.status(400).json({
        error: "OTP not found. Please request a new one.",
      });
      return;
    }

    // Check if OTP is expired
    if (isOTPExpired(user.emailOTPExpiry)) {
      res.status(400).json({
        error: "OTP expired. Please request a new one.",
      });
      return;
    }

    // ✅ Check if OTP matches (now both are strings)
    if (user.emailOTP !== otp) {
      res.status(400).json({ error: "Invalid OTP" });
      return;
    }

    // Mark email as verified and clear OTP fields
    user.isEmailVerified = true;
    user.emailOTP = null;
    user.emailOTPExpiry = null;
    await userRepository.save(user);

    // Capture non-null values to satisfy TypeScript
    const userId = user.id!;
    const userEmail = user.email!;

    // Create OTP verified notification
    try {
      await NotificationService.notifyOTPVerified(userId, {
        verificationTime: new Date(),
        email: userEmail,
      });
      console.log(
        "[DEBUG] OTP verification notification created for user:",
        userId,
      );
    } catch (notificationError) {
      console.error(
        "[DEBUG] Failed to create OTP verification notification:",
        notificationError,
      );
    }

    // After successful verification, issue tokens so frontend can redirect to dashboard without logging in
    try {
      if (!userId || !userEmail) {
        res.status(500).json({ error: "User data incomplete" });
        return;
      }
      const payload = { userId: userId, email: userEmail };
      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // Save refresh token to DB
      const refreshTokenRepository =
        AppDataSource.getRepository(RefreshToken);
      const refreshTokenEntity = refreshTokenRepository.create({
        token: refreshToken,
        userId: userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await refreshTokenRepository.save(refreshTokenEntity);

      // Return tokens and user info so frontend can proceed to dashboard
      return res.json({
        message: "Email verified successfully",
        accessToken,
        refreshToken,
        user: {
          id: userId,
          email: userEmail,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.userType,
          isEmailVerified: user.isEmailVerified,
        },
      });
    } catch (tokenErr) {
      console.error("Post-verify token issue:", tokenErr);
      // If token issuance fails, still return success of verification
      return res.json({ message: "Email verified successfully" });
    }
  } catch (error) {
    console.error("OTP verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}


  /**
   * Resend OTP for email verification.
   * - Finds user by email.
   * - Generates a new OTP and expiry.
   * - Saves OTP to user and logs it (email sending is commented out).
   * - Returns success or error.
   */
  static async resendOTP(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;
      const userRepository = AppDataSource.getRepository(User);

      // Find user by email
      const user = await userRepository.findOne({ where: { email } });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Prevent resending OTP if already verified
      if (user.isEmailVerified) {
        res.status(400).json({ error: "Email already verified" });
        return;
      }

      // Generate new OTP and expiry
      const otp = generateOTP();
      user.emailOTP = otp;
      user.emailOTPExpiry = getOTPExpiry();
      await userRepository.save(user);

      // Send OTP email using Mailtrap
      try {
        await sendMailtrapMail({
          to: email,
          subject: "Your OTP Code",
          text: `Your OTP code is: ${otp}`,
          html: resendOtpTemplate(email, otp),
        });
      } catch (mailErr) {
        console.error("Mailtrap send error:", mailErr);
      }
      console.log(`OTP sent to ${email}. OTP: ${otp}`);

      // Create notification for OTP resend
      try {
        if (user.id) {
          await NotificationService.createNotification(
            user.id,
            NotificationType.SECURITY_ALERT,
            "OTP Resent",
            "A new OTP was generated for email verification.",
            {
              email,
              timestamp: new Date(),
              ipAddress: req.ip,
            },
          );
        }
      } catch (notificationError) {
        console.error(
          "Failed to create resend OTP notification:",
          notificationError,
        );
      }

      res.json({
        message: "OTP sent successfully",
        ...(process.env.NODE_ENV !== "production" ? { otp } : {}),
      });
    } catch (error) {
      console.error("Resend OTP error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Refresh JWT access token using a valid refresh token.
   * - Verifies the refresh token and checks expiry/revocation.
   * - Finds the user and issues a new access token.
   * - Returns the new access token or error.
   */
  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);
      const userRepository = AppDataSource.getRepository(User);

      if (!refreshToken) {
        res.status(401).json({ error: "Refresh token required" });
        return;
      }

      // Verify refresh token and check if not revoked/expired
      const decoded = verifyRefreshToken(refreshToken);
      const tokenEntity = await refreshTokenRepository.findOne({
        where: { token: refreshToken, isRevoked: false },
      });

      if (
        !tokenEntity ||
        !tokenEntity.expiresAt ||
        tokenEntity.expiresAt < new Date()
      ) {
        res.status(403).json({ error: "Invalid refresh token" });
        return;
      }

      // Find user by ID from decoded token
      const user = await userRepository.findOne({
        where: { id: decoded.userId },
      });
      if (!user) {
        res.status(403).json({ error: "User not found" });
        return;
      }

      // Generate new access token
      if (!user.id || !user.email) {
        res.status(500).json({ error: "User data incomplete" });
        return;
      }
      const payload = { userId: user.id, email: user.email };
      const newAccessToken = generateAccessToken(payload);

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(403).json({ error: "Invalid refresh token" });
    }
  }

  /**
   * Logout user by revoking the provided refresh token.
   * - Marks the refresh token as revoked in the database.
   * - Returns a success message.
   */
  static async logout(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

      // Revoke the refresh token if provided
      if (refreshToken) {
        await refreshTokenRepository.update(
          { token: refreshToken },
          { isRevoked: true },
        );
      }

      res.json({ message: "Logged out successfully" });
      //           if (req.user && req.user.email) {
      //     await sendMail(
      //         req.user.email,
      //         'Logout Notification',
      //         logoutNotificationTemplate(req.user.email)
      //     );
      // }
      // Optionally send logout notification email (commented out)
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Logout user from all devices by revoking all refresh tokens for the user.
   * - Marks all refresh tokens for the user as revoked in the database.
   * - Returns a success message.
   */
  static async logoutAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);

      // Revoke all refresh tokens for the user
      if (req.user && req.user.id) {
        await refreshTokenRepository.update(
          { userId: req.user.id },
          { isRevoked: true },
        );
      }

      res.json({ message: "Logged out from all devices successfully" });
      //            if (req.user && req.user.email) {
      //     await sendMail(
      //         req.user.email,
      //         'Logout Notification',
      //         logoutNotificationTemplate(req.user.email)
      //     );
      // }
      // Optionally send logout notification email (commented out)
    } catch (error) {
      console.error("Logout all error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Get all employees for a company.
   * Only accessible by company owners.
   * Returns employee id, name, wallet address, position, and salary.
   */
  static async getCompanyEmployees(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);
      const addressRepository = AppDataSource.getRepository(UserAddress);

      // Get the authenticated user with company relation
      const authUser = await userRepository.findOne({
        where: { id: req.user.id },
        relations: ["company"],
      });

      if (!authUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Check if user is a company owner
      if (authUser.userType !== UserType.COMPANY) {
        res.status(403).json({
          error: "Access denied. Only company owners can view employees.",
        });
        return;
      }

      if (!authUser.company || !authUser.company.id) {
        res.status(404).json({ error: "Company not found" });
        return;
      }

      // Get all employees for this company
      const employees = await userRepository.find({
        where: {
          companyId: authUser.company.id,
          userType: UserType.EMPLOYEE,
        },
        select: ["id", "email", "firstName", "lastName", "position", "salary"],
      });

      // Get wallet addresses for each employee
      const employeesWithWallets = await Promise.all(
        employees.map(async (employee) => {
          // Get Solana wallet address (using testnet for devnet)
          const walletAddress = await addressRepository.findOne({
            where: {
              userId: employee.id!,
              chain: ChainType.SOLANA,
              network: NetworkType.TESTNET, // Solana devnet
            },
          });

          return {
            id: employee.id,
            email: employee.email,
            name:
              `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
              "N/A",
            walletAddress: walletAddress?.address || "Not available",
            position: employee.position || "Not set",
            salary: employee.salary || 0,
          };
        }),
      );

      res.json({
        message: "Employees retrieved successfully",
        companyName: authUser.company.companyName,
        totalEmployees: employeesWithWallets.length,
        employees: employeesWithWallets,
      });
    } catch (error) {
      console.error("Get company employees error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Update employee details (position and salary).
   * Only accessible by company owners for their employees.
   */
  static async updateEmployee(
    req: AuthRequest,
    res: Response,
  ): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { employeeId } = req.params;
      const { position, salary } = req.body;

      if (!employeeId || typeof employeeId !== 'string') {
        res.status(400).json({ error: "Invalid employee ID" });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);

      // Get the authenticated company user
      const authUser = await userRepository.findOne({
        where: { id: req.user.id },
        relations: ["company"],
      });

      if (!authUser) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Check if user is a company owner
      if (authUser.userType !== UserType.COMPANY) {
        res.status(403).json({
          error: "Access denied. Only company owners can update employees.",
        });
        return;
      }

      if (!authUser.company || !authUser.company.id) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      const companyId = authUser.company.id;

      // Get the employee to update
      const employee = await userRepository.findOne({
        where: {
          id: employeeId,
          companyId,
          userType: UserType.EMPLOYEE,
        },
      });

      if (!employee) {
        res.status(404).json({
          error: "Employee not found or does not belong to your company",
        });
        return;
      }

      // Update employee details
      if (position !== undefined) {
        employee.position = position;
      }
      if (salary !== undefined) {
        employee.salary = parseFloat(salary);
      }

      await userRepository.save(employee);

      res.json({
        message: "Employee updated successfully",
        employee: {
          id: employee.id,
          email: employee.email,
          name:
            `${employee.firstName || ""} ${employee.lastName || ""}`.trim() ||
            "N/A",
          position: employee.position,
          salary: employee.salary,
        },
      });
    } catch (error) {
      console.error("Update employee error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Initiate forgot password process
   * - Validates email exists
   * - Generates secure reset token
   * - Sends reset email with token
   * - Sets token expiry (15 minutes)
   */
  static async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { email } });

      if (!user) {
        // Don't reveal if email exists or not for security
        res.json({
          message:
            "If the email exists, you will receive a password reset link",
        });
        return;
      }

      // Generate secure reset token
      const resetToken = generateOTP(); // 6-digit code for simplicity
      const resetExpiry = new Date();
      resetExpiry.setMinutes(resetExpiry.getMinutes() + 15); // 15 minutes expiry

      // Save reset token to user
      user.passwordResetToken = resetToken;
      user.passwordResetExpiry = resetExpiry;
      await userRepository.save(user);

      // Send password reset email
      try {
        await sendMailtrapMail({
          to: email,
          subject: "Password Reset Request",
          text: passwordResetRequestText(email, resetToken),
          html: passwordResetRequestTemplate(email, resetToken),
        });

        console.log(`Password reset email sent to: ${email}`);
        console.log(`Reset token: ${resetToken} (expires: ${resetExpiry})`);
      } catch (emailError) {
        console.error("Failed to send reset email:", emailError);
        // Still return success to not reveal email existence
      }

      // Create notification
      try {
        if (user.id) {
          await NotificationService.createNotification(
            user.id,
            NotificationType.SECURITY_ALERT,
            "Password Reset Requested",
            "A password reset was requested for your account",
            {
              email,
              timestamp: new Date(),
              ipAddress: req.ip,
            },
          );
        }
      } catch (notificationError) {
        console.error(
          "Failed to create reset notification:",
          notificationError,
        );
      }

      res.json({
        message: "If the email exists, you will receive a password reset link",
      });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Verify password reset token
   * - Validates reset token and expiry
   * - Returns success if token is valid
   */
  static async verifyResetToken(req: Request, res: Response): Promise<void> {
    try {
      const { email, token } = req.body;

      if (!email || !token) {
        res.status(400).json({
          error: "Email and reset token are required",
        });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { email } });

      if (!user) {
        res.status(400).json({ error: "Invalid reset token" });
        return;
      }

      // Debug logging
      console.log("=== PASSWORD RESET TOKEN VERIFICATION DEBUG ===");
      console.log("Provided email:", email);
      console.log("Provided token:", token);
      console.log("Stored token in DB:", user.passwordResetToken);
      console.log("Token expiry in DB:", user.passwordResetExpiry);
      console.log("Current time:", new Date());
      console.log("Token matches:", user.passwordResetToken === token);
      console.log("Token exists:", !!user.passwordResetToken);
      console.log("Expiry exists:", !!user.passwordResetExpiry);
      console.log(
        "Is expired:",
        user.passwordResetExpiry
          ? new Date() > user.passwordResetExpiry
          : "N/A",
      );
      console.log("===============================================");

      // Check if token matches and hasn't expired
      if (
        user.passwordResetToken !== token ||
        !user.passwordResetExpiry ||
        new Date() > user.passwordResetExpiry
      ) {
        let errorDetails = [];
        if (user.passwordResetToken !== token) {
          errorDetails.push("Token mismatch");
        }
        if (!user.passwordResetExpiry) {
          errorDetails.push("No expiry set");
        }
        if (user.passwordResetExpiry && new Date() > user.passwordResetExpiry) {
          errorDetails.push("Token expired");
        }

        console.log("Verification failed. Reasons:", errorDetails.join(", "));

        res.status(400).json({
          error: "Invalid or expired reset token",
          debug: errorDetails, // Remove this in production
        });
        return;
      }

      res.json({
        message: "Reset token is valid",
        canResetPassword: true,
      });
    } catch (error) {
      console.error("Verify reset token error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Reset password with token
   * - Validates reset token and expiry
   * - Updates password
   * - Clears reset token
   * - Revokes all existing refresh tokens for security
   */
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email, token, newPassword } = req.body;

      if (!email || !token || !newPassword) {
        res.status(400).json({
          error: "Email, reset token, and new password are required",
        });
        return;
      }

      if (newPassword.length < 6) {
        res.status(400).json({
          error: "Password must be at least 6 characters long",
        });
        return;
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { email } });

      if (!user) {
        res.status(400).json({ error: "Invalid reset token" });
        return;
      }

      // Debug logging
      console.log("=== PASSWORD RESET DEBUG ===");
      console.log("Provided email:", email);
      console.log("Provided token:", token);
      console.log("Stored token in DB:", user.passwordResetToken);
      console.log("Token expiry in DB:", user.passwordResetExpiry);
      console.log("Current time:", new Date());
      console.log("Token matches:", user.passwordResetToken === token);
      console.log("Token exists:", !!user.passwordResetToken);
      console.log("Expiry exists:", !!user.passwordResetExpiry);
      console.log(
        "Is expired:",
        user.passwordResetExpiry
          ? new Date() > user.passwordResetExpiry
          : "N/A",
      );
      console.log("=============================");

      // Check if token matches and hasn't expired
      if (
        user.passwordResetToken !== token ||
        !user.passwordResetExpiry ||
        new Date() > user.passwordResetExpiry
      ) {
        let errorDetails = [];
        if (user.passwordResetToken !== token) {
          errorDetails.push("Token mismatch");
        }
        if (!user.passwordResetExpiry) {
          errorDetails.push("No expiry set");
        }
        if (user.passwordResetExpiry && new Date() > user.passwordResetExpiry) {
          errorDetails.push("Token expired");
        }

        console.log("Reset failed. Reasons:", errorDetails.join(", "));

        res.status(400).json({
          error: "Invalid or expired reset token",
          debug: errorDetails, // Remove this in production
        });
        return;
      }

      // Update password (will be automatically hashed by @BeforeUpdate)
      user.password = newPassword;

      // Clear reset token
      user.passwordResetToken = null;
      user.passwordResetExpiry = null;

      await userRepository.save(user);

      // Revoke all existing refresh tokens for security
      const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);
      await refreshTokenRepository.update(
        { userId: user.id as string },
        { isRevoked: true },
      );

      // Send password change confirmation email
      try {
        await sendMailtrapMail({
          to: email,
          subject: "Password Changed Successfully",
          text: passwordChangedText(email),
          html: passwordChangedTemplate(email),
        });
      } catch (emailError) {
        console.error(
          "Failed to send password change confirmation:",
          emailError,
        );
      }

      // Create notification
      try {
        if (user.id) {
          await NotificationService.createNotification(
            user.id,
            NotificationType.PASSWORD_CHANGE,
            "Password Changed",
            "Your password has been successfully changed",
            {
              email,
              timestamp: new Date(),
              ipAddress: req.ip,
            },
          );
        }
      } catch (notificationError) {
        console.error(
          "Failed to create password change notification:",
          notificationError,
        );
      }

      res.json({
        message:
          "Password reset successfully. Please log in with your new password.",
      });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Map chain names to internal format
   * - Converts common chain names to internal identifiers
   * - Used for consistency in address handling
   */
  static mapChainName(chain: string): string {
    switch (chain) {
      case "ethereum":
        return "eth";
      case "bitcoin":
        return "btc";
      case "solana":
        return "sol";
      case "starknet":
        return "strk";
      case "stellar":
        return "xlm";
      case "polkadot":
        return "dot";
      case "usdt_erc20":
        return "usdterc20";
      case "usdt_trc20":
        return "usdttrc20";
      default:
        return chain;
    }
  }

  /**
   * Helper to sort addresses by desired chain order.
   */
  static sortAddresses(addresses: any[]): any[] {
    const order = [
      "eth",
      "btc",
      "xlm",
      "dot",
      "sol",
      "strk",
      "usdterc20",
      "usdttrc20",
    ];
    return addresses.sort((a, b) => {
      const aIndex = order.indexOf(a.chain);
      const bIndex = order.indexOf(b.chain);
      return aIndex - bIndex;
    });
  }

  /**
   * Get current user profile
   * GET /auth/profile
   */
  static async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: req.user.id },
        select: [
          "id",
          "email",
          "username",
          "firstName",
          "lastName",
          "phoneNumber",
          "userType",
          "isEmailVerified",
          "createdAt",
          "updatedAt",
        ],
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      res.status(200).json({
        message: "Profile retrieved successfully",
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          userType: user.userType,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  /**
   * Update current user profile
   * PATCH /auth/profile
   * Allows updating: username, firstName, lastName, phoneNumber, transactionPin
   */
  static async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const { username, firstName, lastName, phoneNumber, transactionPin } =
        req.body;

      // Validate at least one field is being updated
      if (
        !username &&
        !firstName &&
        !lastName &&
        !phoneNumber &&
        !transactionPin
      ) {
        res.status(400).json({
          error: "At least one field is required to update",
        });
        return;
      }

      const userRepo = AppDataSource.getRepository(User);
      const user = await userRepo.findOne({
        where: { id: req.user.id },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Check if username is being changed and if it's already taken
      if (username && username !== user.username) {
        const existingUser = await userRepo.findOne({
          where: { username },
        });
        if (existingUser) {
          res.status(400).json({ error: "Username already taken" });
          return;
        }
        user.username = username;
      }

      // Update other fields if provided
      if (firstName !== undefined) user.firstName = firstName;
      if (lastName !== undefined) user.lastName = lastName;
      if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;

      // Update transaction PIN if provided
      if (transactionPin) {
        // Validate PIN is 4 digits
        if (!/^\d{4}$/.test(transactionPin)) {
          res.status(400).json({
            error: "Transaction PIN must be exactly 4 digits",
          });
          return;
        }

        const hashedPin = await bcrypt.hash(transactionPin, 10);
        user.transactionPin = hashedPin;
      }

      // Save updated user
      await userRepo.save(user);

      // Return updated user (exclude sensitive fields)
      res.status(200).json({
        message: "Profile updated successfully",
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
          userType: user.userType,
          isEmailVerified: user.isEmailVerified,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      console.error("Update profile error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
