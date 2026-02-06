import { Router } from 'express';
import { SplitPaymentController } from '../controllers/SplitPaymentController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: SplitPayment
 *     description: Split payment templates and executions
 */

/**
 * @swagger
 * /split-payment/create:
 *   post:
 *     tags: [SplitPayment]
 *     summary: Create a reusable split payment template
 *     description: |
 *       Creates a split payment template that can be executed multiple times to send payments to multiple recipients.
 *       
 *       **Supported Chains:** solana, ethereum, usdt_erc20, bitcoin, stellar, polkadot, starknet
 *       
 *       **Fee Structure (added to each payment):**
 *       - $0 - $10: $0.00 (no fee)
 *       - $10.01 - $50: $0.10
 *       - $51 - $100: $0.25
 *       - $101 - $500: $1.00
 *       - $501 - $1,000: $2.00
 *       - $1,001+: 0.5%
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - chain
 *               - network
 *               - fromAddress
 *               - recipients
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Monthly Team Payments"
 *               description:
 *                 type: string
 *                 example: "Pay development team"
 *               chain:
 *                 type: string
 *                 enum: [solana, ethereum, usdt_erc20, bitcoin, stellar, polkadot, starknet, starknet_eth]
 *                 example: "solana"
 *               network:
 *                 type: string
 *                 enum: [mainnet, testnet]
 *                 example: "testnet"
 *               fromAddress:
 *                 type: string
 *                 example: "8KnBR3bZxZVQsiJvqLVcEpkQw5K1pQJZYmzxZ6ZxYfhC"
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - amount
 *                   properties:
 *                     address:
 *                       type: string
 *                       example: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
 *                     username:
 *                       type: string
 *                       example: "alice_dev"
 *                     amount:
 *                       type: string
 *                       description: Amount in USD (fees calculated on this)
 *                       example: "100"
 *                     name:
 *                       type: string
 *                       example: "Alice Developer"
 *                     email:
 *                       type: string
 *                       example: "alice@example.com"
 *           examples:
 *             solana:
 *               summary: Solana Split Payment
 *               value:
 *                 title: "Monthly Team Payments"
 *                 description: "Pay development team"
 *                 chain: "solana"
 *                 network: "testnet"
 *                 fromAddress: "8KnBR3bZxZVQsiJvqLVcEpkQw5K1pQJZYmzxZ6ZxYfhC"
 *                 recipients:
 *                   - address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
 *                     name: "Alice Developer"
 *                     amount: "100"
 *                   - address: "FqKz3xH8VzJqN9RbQvLqPxW8JKkYz2m8H5jGqZ3K8MpP"
 *                     name: "Bob Designer"
 *                     amount: "75"
 *                   - username: "charlie_tester"
 *                     amount: "50"
 *     responses:
 *       201:
 *         description: Split payment template created successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Address or username not found
 */
// Create split payment template (reusable)
router.post(
    '/create',
    authMiddleware,
    SplitPaymentController.createSplitPayment
);

/**
 * @swagger
 * /split-payment/{id}/execute:
 *   post:
 *     tags: [SplitPayment]
 *     summary: Execute a split payment template
 *     description: |
 *       Executes a split payment, sending funds to all recipients. Can be run multiple times.
 *       
 *       **Process:**
 *       1. Validates balance
 *       2. Calculates fees per payment
 *       3. Sends transactions to recipients
 *       4. Collects fees to treasury
 *       
 *       **Example:** $225 to 3 recipients = $225.60 total (including $0.60 fees)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "abc-123-def-456"
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transactionPin:
 *                 type: string
 *                 example: "1234"
 *     responses:
 *       200:
 *         description: Execution successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 execution:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [COMPLETED, PARTIALLY_FAILED, FAILED]
 *                     successful:
 *                       type: number
 *                     failed:
 *                       type: number
 *                 feeBreakdown:
 *                   type: object
 *                   properties:
 *                     totalPaymentAmount:
 *                       type: number
 *                     totalFees:
 *                       type: number
 *                     senderPaysTotal:
 *                       type: number
 *                     treasuryAddress:
 *                       type: string
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       recipient:
 *                         type: string
 *                       amount:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       txHash:
 *                         type: string
 *                       fee:
 *                         type: number
 *       400:
 *         description: Bad request
 *       404:
 *         description: Split payment not found
 */
// Execute split payment (can be done multiple times)
router.post(
    '/:id/execute',
    authMiddleware,
    SplitPaymentController.executeSplitPayment
);

/**
 * @swagger
 * /split-payment/templates:
 *   get:
 *     tags: [SplitPayment]
 *     summary: Get all split payment templates
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Templates list
 */
// Get all split payment templates
router.get(
    '/templates',
    authMiddleware,
    SplitPaymentController.getSplitPaymentTemplates
);

/**
 * @swagger
 * /split-payment/{id}/executions:
 *   get:
 *     tags: [SplitPayment]
 *     summary: Get execution history for a split payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Execution history
 */
// Get execution history for a specific split
router.get(
    '/:id/executions',
    authMiddleware,
    SplitPaymentController.getExecutionHistory
);

/**
 * @swagger
 * /split-payment/{id}/toggle:
 *   patch:
 *     tags: [SplitPayment]
 *     summary: Toggle split payment active status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Status toggled
 */
// Toggle split payment status (activate/deactivate)
router.patch(
    '/:id/toggle',
    authMiddleware,
    SplitPaymentController.toggleSplitPayment
);

/**
 * @swagger
 * /split-payment/{id}:
 *   patch:
 *     tags: [SplitPayment]
 *     summary: Update split payment template
 *     description: Update title, description, or recipients of an existing split payment template
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: Split payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Updated Monthly Team Payments"
 *               description:
 *                 type: string
 *                 example: "Updated payment distribution"
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                       example: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
 *                     username:
 *                       type: string
 *                       example: "john_doe"
 *                     amount:
 *                       type: string
 *                       example: "50"
 *                     description:
 *                       type: string
 *                       example: "Developer payment"
 *     responses:
 *       200:
 *         description: Split payment updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 splitPayment:
 *                   type: object
 *       400:
 *         description: Bad request - validation error
 *       404:
 *         description: Split payment not found
 */
// Update split payment
router.patch(
    '/:id',
    authMiddleware,
    SplitPaymentController.updateSplitPayment
);

export default router;
