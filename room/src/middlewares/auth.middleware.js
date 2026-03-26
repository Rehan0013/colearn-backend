import jwt from "jsonwebtoken";
import config from "../config/_config.js";
import redis from "../db/redis.js";

/**
 * Verifies the JWT issued by auth-service.
 * room-service does NOT have its own user DB — it trusts the token.
 */
export const authMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Access denied. Please log in." });
        }

        // Check blacklist in shared Redis
        const isBlacklisted = await redis.get(`bl_${token}`);
        if (isBlacklisted) {
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }

        const decoded = jwt.verify(token, config.JWT_SECRET);
        req.user = { id: decoded.id };
        next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token. Please log in again." });
    }
};