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
 *     summary: Manually trigger deposit check for all users
 *     description: Checks all wallet addresses for balance increases and creates notifications. Runs automatically every 5 minutes in the background.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deposit check started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Deposit check started in background"
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
 * /wallet/deposit-watcher/status:
 *   get:
 *     tags: [Wallet]
 *     summary: Get deposit watcher status
 *     description: Check if the automatic deposit monitoring is running and its configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Watcher status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 running:
 *                   type: boolean
 *                   example: true
 *                 intervalMinutes:
 *                   type: number
 *                   example: 5
 *                 message:
 *                   type: string
 *                   example: "Deposit watcher is running, checking every 5 minutes"
 */
router.get('/deposit-watcher/status', authMiddleware, async (req, res) => {
    const depositWatcher = require('../services/depositWatcher').default;
    const status = depositWatcher.getStatus();
    res.json({
        ...status,
        message: status.running 
            ? `Deposit watcher is running, checking every ${status.intervalMinutes} minutes`
            : 'Deposit watcher is not running'
    });
});

/**
 * @swagger
 * /wallet/send:
 *   post:
 *     tags: [Wallet]
 *     summary: Send cryptocurrency from your wallet
 *     description: |
 *       Send funds from your ZENGA wallet to any blockchain address.
 *       
 *       **Fee Structure:**
 *       - $0 - $10: $0.00
 *       - $10.01 - $50: $0.10
 *       - $51 - $100: $0.25
 *       - $101 - $500: $1.00
 *       - $501 - $1,000: $2.00
 *       - $1,001+: 0.5%
 *       
 *       **Supported Chains:** solana, ethereum, usdt_erc20, bitcoin, stellar, polkadot, starknet
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - chain
 *               - network
 *               - toAddress
 *               - amount
 *               - transactionPin
 *             properties:
 *               chain:
 *                 type: string
 *                 enum: [solana, ethereum, usdt_erc20, bitcoin, stellar, polkadot, starknet]
 *                 description: Blockchain to send on
 *                 example: "solana"
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 description: Network type
 *                 example: "testnet"
 *               toAddress:
 *                 type: string
 *                 description: Recipient blockchain address
 *                 example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
 *               amount:
 *                 type: string
 *                 description: Amount in native token (SOL, ETH, BTC, etc.)
 *                 example: "0.5"
 *               fromAddress:
 *                 type: string
 *                 description: Optional - your specific wallet address to send from
 *                 example: "8KnBR3bZxZVQsiJvqLVcEpkQw5K1pQJZYmzxZ6ZxYfhC"
 *               transactionPin:
 *                 type: string
 *                 description: Your 4-digit transaction PIN
 *                 example: "1234"
 *               force:
 *                 type: boolean
 *                 description: Force send even with warnings (optional)
 *                 example: false
 *           examples:
 *             solana:
 *               summary: Send SOL on Solana
 *               value:
 *                 chain: "solana"
 *                 network: "testnet"
 *                 toAddress: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
 *                 amount: "0.5"
 *                 transactionPin: "1234"
 *             ethereum:
 *               summary: Send ETH on Ethereum
 *               value:
 *                 chain: "ethereum"
 *                 network: "testnet"
 *                 toAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 *                 amount: "0.01"
 *                 transactionPin: "1234"
 *     responses:
 *       200:
 *         description: Transaction sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Transaction sent successfully"
 *                 transaction:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     txHash:
 *                       type: string
 *                       example: "5J7k8m9n0p1q2r3s4t5u6v7w8x9y0z..."
 *                     amount:
 *                       type: number
 *                     fromAddress:
 *                       type: string
 *                     toAddress:
 *                       type: string
 *                     chain:
 *                       type: string
 *                     network:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: "confirmed"
 *                 feeBreakdown:
 *                   type: object
 *                   properties:
 *                     amountUSD:
 *                       type: number
 *                       example: 25.50
 *                     feeUSD:
 *                       type: number
 *                       example: 0.10
 *                     feeToken:
 *                       type: number
 *                       example: 0.002
 *                     tier:
 *                       type: string
 *                       example: "$10.01-$50"
 *                     senderPaysTotal:
 *                       type: number
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   examples:
 *                     - "Missing required fields: chain, network, toAddress, amount"
 *                     - "Amount must be positive"
 *                     - "Missing transactionPin (or pin) in request body"
 *                     - "Transaction PIN not set"
 *       403:
 *         description: Invalid transaction PIN
 *       404:
 *         description: Wallet not found
 *       500:
 *         description: Transaction failed
 */
router.post('/send', authMiddleware, async (req, res) => {
    await WalletController.sendTransaction(req, res);
});

/**
 * @swagger
 * /wallet/send/by-username:
 *   post:
 *     tags: [Wallet]
 *     summary: Send cryptocurrency to a ZENGA user by username
 *     description: |
 *       Send funds to another ZENGA user by their username. The system automatically resolves
 *       the username to the recipient's wallet address for the specified chain and network.
 *       
 *       **Benefits:**
 *       - No need to know recipient's wallet address
 *       - Prevents sending to wrong addresses
 *       - Automatic address resolution
 *       
 *       **Note:** Same fee structure applies as regular send.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - chain
 *               - network
 *               - amount
 *               - transactionPin
 *             properties:
 *               username:
 *                 type: string
 *                 description: ZENGA username of recipient
 *                 example: "alice_dev"
 *               chain:
 *                 type: string
 *                 enum: [solana, ethereum, usdt_erc20, bitcoin, stellar, polkadot, starknet]
 *                 example: "solana"
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 example: "testnet"
 *               amount:
 *                 type: string
 *                 description: Amount in native token
 *                 example: "0.5"
 *               fromAddress:
 *                 type: string
 *                 description: Optional - your specific wallet to send from
 *                 example: "8KnBR3bZxZVQsiJvqLVcEpkQw5K1pQJZYmzxZ6ZxYfhC"
 *               transactionPin:
 *                 type: string
 *                 description: Your 4-digit transaction PIN
 *                 example: "1234"
 *           examples:
 *             solana:
 *               summary: Send SOL by username
 *               value:
 *                 username: "alice_dev"
 *                 chain: "solana"
 *                 network: "testnet"
 *                 amount: "0.5"
 *                 transactionPin: "1234"
 *     responses:
 *       200:
 *         description: Transaction sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 txHash:
 *                   type: string
 *                 recipientUsername:
 *                   type: string
 *                 recipientAddress:
 *                   type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   examples:
 *                     - "Missing required fields: username, chain, network, amount"
 *                     - "Cannot send to yourself"
 *       404:
 *         description: User or address not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   examples:
 *                     - "Username not found: alice_dev"
 *                     - "Username alice_dev has no wallet on solana/testnet"
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
