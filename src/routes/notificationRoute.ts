import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Notification
 *     description: User notifications
 */

/**
 * @swagger
 * /notification:
 *   get:
 *     tags: [Notification]
 *     summary: Get all notifications for the authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications list
 */
// Get all notifications for the user
router.get('/', authMiddleware, NotificationController.getNotifications);

/**
 * @swagger
 * /notification/count:
 *   get:
 *     tags: [Notification]
 *     summary: Get unread notification count
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Count returned
 */
// Get unread notification count
router.get('/count', authMiddleware, NotificationController.getUnreadCount);

/**
 * @swagger
 * /notification/{id}/read:
 *   patch:
 *     tags: [Notification]
 *     summary: Mark a notification as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Marked as read
 */
// Mark notification as read
router.patch('/:id/read', authMiddleware, NotificationController.markAsRead);

/**
 * @swagger
 * /notification/read-all:
 *   patch:
 *     tags: [Notification]
 *     summary: Mark all notifications as read
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All marked as read
 */
// Mark all notifications as read
router.patch('/read-all', authMiddleware, NotificationController.markAllAsRead);

/**
 * @swagger
 * /notification/swap:
 *   post:
 *     tags: [Notification]
 *     summary: Create a swap notification
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
 *         description: Notification created
 */
// Create specific notification types
router.post('/swap', authMiddleware, NotificationController.notifySwap);
router.post(
    '/send-money',
    authMiddleware,
    NotificationController.notifySendMoney
);
router.post(
    '/receive-money',
    authMiddleware,
    NotificationController.notifyReceiveMoney
);
router.post(
    '/security-alert',
    authMiddleware,
    NotificationController.notifySecurityAlert
);

/**
 * @swagger
 * /notification/clear:
 *   delete:
 *     tags: [Notification]
 *     summary: Clear all notifications for the user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications cleared
 */
// Clear all notifications
router.delete(
    '/clear',
    authMiddleware,
    NotificationController.clearAllNotifications
);

export default router;
