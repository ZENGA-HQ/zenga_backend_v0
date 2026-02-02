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
 *     summary: Create a split payment template
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       201:
 *         description: Split payment template created
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
 *     summary: Execute a split payment
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
 *         description: Execution started
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

export default router;
