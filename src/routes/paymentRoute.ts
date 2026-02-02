import { Router } from "express";
import { PaystackController } from "../controllers/paystackFiatController";
import { authMiddleware } from "../middleware/auth";

const router = Router();

const paystackController = new PaystackController();

/**
 * @swagger
 * tags:
 *   - name: Payment
 *     description: Payment related endpoints
 */

/**
 * @swagger
 * /payment/fund-wallet:
 *   post:
 *     tags: [Payment]
 *     summary: Initialize a fund wallet payment (Paystack)
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
 *         description: Payment initialized
 */
router.post("/fund-wallet", authMiddleware, paystackController.fundWallet);

/**
 * @swagger
 * /payment/verify-payment:
 *   post:
 *     tags: [Payment]
 *     summary: Paystack webhook to verify payments
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook handled
 */
router.post("/verify-payment", paystackController.verifyTransactionWithWebhook);

export default router;
