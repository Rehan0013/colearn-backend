import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config/_config.js";
import redis from "../db/redis.js";

interface DecodedToken {
    id: string;
    email: string;
    fullName: {
        firstName: string;
        lastName: string;
    };
}

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({ message: "Access denied. Please log in." });
        }

        const isBlacklisted = await redis.get(`bl_${token}`);
        if (isBlacklisted) {
            return res.status(401).json({ message: "Session expired. Please log in again." });
        }

        const decoded = jwt.verify(token, config.jwt_secret) as DecodedToken;
        req.user = {
            id: decoded.id,
            email: decoded.email,
            fullName: decoded.fullName,
        };
        next();
    } catch {
        return res.status(401).json({ message: "Invalid or expired token." });
    }
};
