import redis from "../db/redis.js";

/**
 * Express middleware for Redis-backed API Rate Limiting
 * @param {Object} options Configuration options
 * @param {number} options.windowSeconds Time window in seconds (default: 900s = 15m)
 * @param {number} options.maxRequests Max requests allowed within window (default: 100)
 * @param {string} options.keyPrefix Prefix for Redis keys
 */
export const rateLimiter = ({ windowSeconds = 900, maxRequests = 100, keyPrefix = "rl" } = {}) => {
    return async (req, res, next) => {
        try {
            // Get client IP address
            const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
            const key = `rate_limit:${keyPrefix}:${ip}`;

            // Atomic operations in a single Redis transaction / pipeline
            const results = await redis.multi().incr(key).ttl(key).exec();
            const current = results[0][1];
            let ttl = results[1][1];

            // If key is brand new (ttl is -1 or less than 0), set expire
            if (ttl < 0) {
                await redis.expire(key, windowSeconds);
                ttl = windowSeconds;
            }

            // Set standard rate limit headers
            res.setHeader("X-RateLimit-Limit", maxRequests);
            res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - current));
            res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1000) + (ttl > 0 ? ttl : windowSeconds));

            // Check if rate limit exceeded
            if (current > maxRequests) {
                return res.status(429).json({
                    message: "Too many requests. Please try again later.",
                });
            }

            next();
        } catch (error) {
            // Fail open: log error but do not block request if Redis is down
            console.error("Rate limiter error:", error);
            next();
        }
    };
};
