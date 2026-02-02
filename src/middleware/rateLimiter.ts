import rateLimit from 'express-rate-limit';
import { RequestHandler } from 'express';

// Basic in-memory rate limiter for development. For production use a
// Redis-backed store (e.g. rate-limit-redis) so limits are shared across
// multiple instances.

export function createRateLimiter(options?: Partial<{
    windowMs: number;
    max: number;
    message: string;
}>): RequestHandler {
    const limiter = rateLimit({
        windowMs: options?.windowMs ?? 15 * 60 * 1000, // 15 minutes
        max: options?.max ?? 100, // limit each IP to 100 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        message:
            options?.message ?? 'Too many requests from this IP, please try again later.',
    });
    return limiter as RequestHandler;
}

export default createRateLimiter;
