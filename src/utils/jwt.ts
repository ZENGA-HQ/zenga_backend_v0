import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';

// Validate JWT secrets early and provide safe defaults in development.
let JWT_SECRET = process.env.JWT_SECRET;
let JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: JWT_SECRET environment variable is required in production');
        process.exit(1);
    }
    JWT_SECRET = 'dev_jwt_secret_change_me';
    console.warn('Warning: JWT_SECRET not set, using development fallback. Set JWT_SECRET in .env for production');
}

if (!JWT_REFRESH_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: JWT_REFRESH_SECRET environment variable is required in production');
        process.exit(1);
    }
    JWT_REFRESH_SECRET = 'dev_jwt_refresh_secret_change_me';
    console.warn('Warning: JWT_REFRESH_SECRET not set, using development fallback. Set JWT_REFRESH_SECRET in .env for production');
}

export const generateAccessToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '30m' });
};

export const generateRefreshToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

export const verifyAccessToken = (token: string): JWTPayload => {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
};

export const verifyRefreshToken = (token: string): JWTPayload => {
    return jwt.verify(token, JWT_REFRESH_SECRET) as JWTPayload;
};
