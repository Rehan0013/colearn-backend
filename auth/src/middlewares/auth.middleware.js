import jwt from "jsonwebtoken";
import config from "../config/_config.js";
import redis from "../db/redis.js";
import userModel from "../models/user.model.js";

export const authMiddleware = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Access denied. Please log in." });
        }

        // Check if token is blacklisted (logged out)
        const isBlacklisted = await redis.get(`bl_${token}`);
        if (isBlacklisted) {
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, config.jwt_secret);
        } catch (err) {
            return res.status(401).json({ message: "Invalid or expired token. Please log in again." });
        }

        // Fetch fresh user from DB — never rely on stale token payload
        const user = await userModel.findById(decoded.id).select("-password -refreshToken");
        if (!user) {
            return res.status(401).json({ message: "User no longer exists." });
        }

        req.user = user;
        next();
    } catch (error) {
        next(error);
    }
};