import { Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { AuthRequest } from '../types';

export const authMiddleware = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            res.status(401).json({ error: 'Access token required' });
            return;
        }

        const decoded = verifyAccessToken(token);
        const userRepository = AppDataSource.getRepository(User);
        const user = await userRepository.findOne({
            where: { id: decoded.userId },
            relations: ['addresses', 'kycDocument'],
        });

        if (!user) {
            res.status(401).json({ error: 'User not found' });
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid or expired token' });
    }
};

export const requireEmailVerification = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user?.isEmailVerified) {
        res.status(403).json({ error: 'Email verification required' });
        return;
    }
    next();
};
