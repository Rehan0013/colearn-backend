import jwt from "jsonwebtoken";
import config from "../config/_config.js";
import redis from "../db/redis.js";
import userModel from "../models/user.model.js";

export const authMiddleware = async (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({ message: "Unauthorized - Please login first" });
    }
    try {
        // check token in redis
        const isTokenBlacklisted = await redis.get(`bl_${token}`);

        if (isTokenBlacklisted) {
            return res.status(401).json({ message: "Unauthorized - Token is blacklisted" });
        }

        const decoded = jwt.verify(token, config.jwt_secret);
        const user = await userModel.findById(decoded.id).select("-password -__v");
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized" });
    }
};