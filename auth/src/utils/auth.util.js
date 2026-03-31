import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import redis from "../db/redis.js";
import config from "../config/_config.js";
import userModel from "../models/user.model.js";
import { generateOTP } from "./otp.js";
import { publishToQueue } from "../broker/rabbit.js";
import { uploadImage } from "../services/storage.service.js";

// ─── Token helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a short-lived access token (15 min)
 */
export const generateAccessToken = (user) => {
    return jwt.sign(
        {
            id: user._id,
            email: user.email,
            fullName: user.fullName
        },
        config.jwt_secret,
        { expiresIn: "15m" }
    );
};

/**
 * Generate a long-lived refresh token (7 days) and store it in Redis
 */
export const generateRefreshToken = async (userId) => {
    const refreshToken = jwt.sign({ id: userId }, config.jwt_refresh_secret, { expiresIn: "7d" });
    // Store in Redis — key: refresh_{userId}, TTL: 7 days
    await redis.set(`refresh_${userId}`, refreshToken, "EX", 60 * 60 * 24 * 7);
    return refreshToken;
};

/**
 * Set access + refresh tokens as httpOnly cookies
 */
export const setTokenCookies = (res, accessToken, refreshToken) => {
    res.cookie("token", accessToken, {
        httpOnly: true,
        secure: config.node_env === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000, // 15 minutes
        path: "/",
    });

    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: config.node_env === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
    });
};

// ─── Registration ──────────────────────────────────────────────────────────────

/**
 * Handles registration: checks duplicate, hashes password,
 * uploads avatar, stores in Redis, publishes OTP event.
 */
export const handleRegistration = async ({ email, password, firstName, lastName, avatar }) => {
    // Check user already exists
    const isUserExist = await userModel.findOne({ email });
    if (isUserExist) {
        const error = new Error("An account with this email already exists");
        error.statusCode = 409;
        throw error;
    }

    // Hash password before storing in Redis
    const hashedPassword = await bcrypt.hash(password, 12); // 12 rounds is safer than 10

    // Upload avatar only if provided
    let avatarUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
    if (avatar) {
        const uploaded = await uploadImage(avatar.buffer, avatar.originalname);
        avatarUrl = uploaded.url;
    }

    // Generate OTP
    const otp = generateOTP();

    // Store in Redis — expires in 10 minutes
    const userData = { email, password: hashedPassword, firstName, lastName, avatar: avatarUrl };
    await redis.set(`reg_${email}`, JSON.stringify({ userData, otp }), "EX", 60 * 10);

    // Publish OTP email event to RabbitMQ
    await publishToQueue("send_otp", {
        email,
        otp,
        fullName: { firstName, lastName },
        type: "registration",
    });
};

// ─── Google OAuth ──────────────────────────────────────────────────────────────

/**
 * Handles Google OAuth callback: find or create user, issue tokens, redirect.
 */
export const handleGoogleCallback = async (res, googleUser) => {
    const email = googleUser.emails[0].value;
    const googleId = googleUser.id;

    // Find existing user by googleId or email
    let user = await userModel.findOne({ $or: [{ email }, { googleId }] });

    if (!user) {
        // New user via Google — create and publish event
        user = await userModel.create({
            email,
            googleId,
            fullName: {
                firstName: googleUser.name.givenName,
                lastName: googleUser.name.familyName,
            },
            avatar: googleUser.photos[0].value,
            isVerified: true, // Google users are pre-verified
        });

        await publishToQueue("user_created", {
            id: user._id,
            email: user.email,
            fullName: user.fullName,
        });

        // Welcome notification
        await publishToQueue("user.welcome", {
            email: user.email,
            fullName: user.fullName,
        });
    } else if (!user.googleId) {
        // Existing email/password user — link their Google account
        user.googleId = googleId;
        user.isVerified = true;
        await user.save();
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Issue tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateRefreshToken(user._id);
    setTokenCookies(res, accessToken, refreshToken);

    res.redirect(config.client_url);
};