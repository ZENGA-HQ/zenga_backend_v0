import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Notification } from '../entities/Notification';
import { AuthRequest } from '../types';
import { NotificationService } from '../services/notificationService';

export class NotificationController {
    /**
     * Get all notifications for the authenticated user.
     * Returns notifications ordered by most recent first.
     */
    static async getNotifications(
        req: AuthRequest,
        res: Response
    ): Promise<void> {
        try {
            const { page = 1, limit = 20, unreadOnly = false } = req.query;
            const notificationRepo = AppDataSource.getRepository(Notification);

            const whereClause: any = { userId: req.user!.id };
            if (unreadOnly === 'true') {
                whereClause.isRead = false;
            }

            const [notifications, total] = await notificationRepo.findAndCount({
                where: whereClause,
                order: { createdAt: 'DESC' },
                take: Number(limit),
                skip: (Number(page) - 1) * Number(limit),
            });

            res.json({
                notifications,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit)),
                },
            });
        } catch (error) {
            console.error('Get notifications error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const notificationRepo = AppDataSource.getRepository(Notification);

            const notification = await notificationRepo.findOne({
                where: { id: typeof id === 'string' ? id : id[0], userId: req.user!.id },
            });

            if (!notification) {
                res.status(404).json({ error: 'Notification not found' });
                return;
            }

            notification.isRead = true;
            await notificationRepo.save(notification);

            res.json({ message: 'Notification marked as read', notification });
        } catch (error) {
            console.error('Mark notification as read error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Mark all notifications as read
     */
    static async markAllAsRead(req: AuthRequest, res: Response): Promise<void> {
        try {
            const notificationRepo = AppDataSource.getRepository(Notification);

            await notificationRepo.update(
                { userId: req.user!.id, isRead: false },
                { isRead: true }
            );

            res.json({ message: 'All notifications marked as read' });
        } catch (error) {
            console.error('Mark all notifications as read error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get unread notification count
     */
    static async getUnreadCount(
        req: AuthRequest,
        res: Response
    ): Promise<void> {
        try {
            const notificationRepo = AppDataSource.getRepository(Notification);

            const count = await notificationRepo.count({
                where: { userId: req.user!.id, isRead: false },
            });

            res.json({ unreadCount: count });
        } catch (error) {
            console.error('Get unread count error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Create a swap notification
     */
    static async notifySwap(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const { fromAmount, fromCurrency, toAmount, toCurrency, details } =
                req.body;

            const notification = await NotificationService.notifySwap(
                userId,
                fromAmount,
                fromCurrency,
                toAmount,
                toCurrency,
                details
            );

            res.json({ message: 'Swap notification created', notification });
        } catch (error) {
            console.error('Notify swap error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Create a send money notification
     */
    static async notifySendMoney(
        req: AuthRequest,
        res: Response
    ): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const { amount, currency, toAddress, txHash, details } = req.body;

            const notification = await NotificationService.notifySendMoney(
                userId,
                amount,
                currency,
                toAddress,
                txHash,
                details
            );

            res.json({
                message: 'Send money notification created',
                notification,
            });
        } catch (error) {
            console.error('Notify send money error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Create a receive money notification
     */
    static async notifyReceiveMoney(
        req: AuthRequest,
        res: Response
    ): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const { amount, currency, fromAddress, txHash, details } = req.body;

            const notification = await NotificationService.notifyReceiveMoney(
                userId,
                amount,
                currency,
                fromAddress,
                txHash,
                details
            );

            res.json({
                message: 'Receive money notification created',
                notification,
            });
        } catch (error) {
            console.error('Notify receive money error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Create a security alert notification
     */
    static async notifySecurityAlert(
        req: AuthRequest,
        res: Response
    ): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const { alertMessage, details } = req.body;

            const notification = await NotificationService.notifySecurityAlert(
                userId,
                alertMessage,
                details
            );

            res.json({
                message: 'Security alert notification created',
                notification,
            });
        } catch (error) {
            console.error('Notify security alert error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Clear all notifications for the authenticated user
     */
    static async clearAllNotifications(
        req: AuthRequest,
        res: Response
    ): Promise<void> {
        try {
            const notificationRepo = AppDataSource.getRepository(Notification);
            await notificationRepo.update(
                { userId: req.user!.id },
                { isArchived: true }
            );
            res.json({ message: 'All notifications cleared' });
        } catch (error) {
            res.status(500).json({ error: 'Failed to clear notifications' });
        }
    }
}
