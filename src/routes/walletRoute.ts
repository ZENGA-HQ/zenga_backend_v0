import { Router } from 'express';
import { WalletController } from '../controllers/walletController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Wallet
 *     description: Wallet related endpoints
 */

/**
 * @swagger
 * /wallet/balances/testnet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get testnet balances for authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balances returned
 */
// Get testnet balances for the authenticated user
router.get(
    '/balances/testnet',
    authMiddleware,
    WalletController.getTestnetBalances
);

/**
 * @swagger
 * /wallet/balances/mainnet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get mainnet balances for authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Balances returned
 */
// Get mainnet balances for the authenticated user
router.get(
    '/balances/mainnet',
    authMiddleware,
    WalletController.getMainnetBalances
);

/**
 * @swagger
 * /wallet/addresses:
 *   get:
 *     tags: [Wallet]
 *     summary: Get all wallet addresses for user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses returned
 */
// Get user wallet addresses
router.get('/addresses', authMiddleware, WalletController.getWalletAddresses);

/**
 * @swagger
 * /wallet/addresses/testnet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get user testnet addresses (chain and address only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Testnet addresses returned
 */
// Get user testnet addresses (chain and address only)
router.get(
    '/addresses/testnet',
    authMiddleware,
    WalletController.getTestnetAddresses
);

/**
 * @swagger
 * /wallet/addresses/mainnet:
 *   get:
 *     tags: [Wallet]
 *     summary: Get user mainnet addresses (chain and address only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Mainnet addresses returned
 */
// Get user mainnet addresses (chain and address only)
router.get(
    '/addresses/mainnet',
    authMiddleware,
    WalletController.getMainnetAddresses
);

/**
 * @swagger
 * /wallet/check-deposits:
 *   post:
 *     tags: [Wallet]
 *     summary: Trigger background deposit check
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Background job started
 */
router.post('/check-deposits', async (req, res) => {
    // Return immediately and process in background
    res.json({ message: 'Deposit check started in background' });

    // Process deposits in background
    try {
        await WalletController.checkForDeposits();
    } catch (error) {
        console.error('Background deposit check failed:', error);
    }
});

/**
 * @swagger
 * /wallet/send:
 *   post:
 *     tags: [Wallet]
 *     summary: Send funds from user wallet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Transaction sent
 */
router.post('/send', authMiddleware, async (req, res) => {
    await WalletController.sendTransaction(req, res);
});

/**
 * @swagger
 * /wallet/send/by-username:
 *   post:
 *     tags: [Wallet]
 *     summary: Send by username (resolves username to address)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Transaction sent
 */
// Send by username (resolve username -> address, then delegate to sendTransaction)
router.post('/send/by-username', authMiddleware, async (req, res) => {
    await WalletController.sendByUsername(req as any, res as any);
});

/**
 * @swagger
 * /wallet/debug/alchemy-probe:
 *   get:
 *     tags: [Wallet]
 *     summary: Debug probe for Alchemy endpoints
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Probe result
 */
// Debug probe for Alchemy endpoints (requires auth)
router.get('/debug/alchemy-probe', authMiddleware, async (req, res) => {
    await WalletController.alchemyProbe(req as any, res as any);
});

export default router;
