import jwt from "jsonwebtoken";
import config from "../../config/_config.js";
import redis from "../../db/redis.js";

/**
 * Runs once when a client connects via Socket.io.
 * Reads JWT from cookie or handshake auth header.
 * Attaches decoded user to socket.user.
 */
export const socketAuthMiddleware = async (socket, next) => {
    try {
        // Support both cookie-based and header-based tokens
        const token =
            socket.handshake.headers.cookie?.split("token=")[1]?.split(";")[0] ||
            socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Authentication required"));
        }

        // Check blacklist
        const isBlacklisted = await redis.get(`bl_${token}`);
        if (isBlacklisted) {
            return next(new Error("Session expired. Please log in again."));
        }

        const decoded = jwt.verify(token, config.jwt_secret);
        socket.user = {
            id: decoded.id,
            email: decoded.email,
            fullName: decoded.fullName
        };
        next();
    } catch {
        next(new Error("Invalid or expired token"));
    }
};