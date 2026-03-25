import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import userModel from "../models/user.model.js";
import config from "../config/_config.js";
import redis from "../db/redis.js";
import { publishToQueue } from "../broker/rabbit.js";
import { generateOTP } from "../utils/otp.js";
import { uploadImage } from "../services/storage.service.js";
import {
    handleRegistration,
    handleGoogleCallback,
    generateAccessToken,
    generateRefreshToken,
    setTokenCookies,
} from "../utils/auth.util.js";

// ─── Register ──────────────────────────────────────────────────────────────────

export const registerController = async (req, res, next) => {
    try {
        const { email, password, firstName, lastName } = req.body;
        const avatar = req.file; // optional
        await handleRegistration({ email, password, firstName, lastName, avatar });
        res.status(200).json({
            message: "OTP sent to your email. Please verify to complete registration.",
        });
    } catch (error) {
        next(error);
    }
};

// ─── Verify Registration (OTP) ─────────────────────────────────────────────────

export const verifyRegistrationController = async (req, res, next) => {
    try {
        const { email, otp } = req.body;

        // Retrieve from Redis
        const cachedData = await redis.get(`reg_${email}`);
        if (!cachedData) {
            return res.status(400).json({ message: "OTP expired or invalid. Please register again." });
        }

        const { userData, otp: cachedOtp } = JSON.parse(cachedData);

        if (otp !== cachedOtp) {
            return res.status(400).json({ message: "Invalid OTP. Please try again." });
        }

        // Create user — password is already hashed (done in handleRegistration)
        const user = await userModel.create({
            email: userData.email,
            password: userData.password,
            fullName: {
                firstName: userData.firstName,
                lastName: userData.lastName,
            },
            avatar: userData.avatar,
            isVerified: true,
        });

        // Clean up Redis
        await redis.del(`reg_${email}`);

        // Publish events
        await publishToQueue("user_created", {
            id: user._id,
            email: user.email,
            fullName: user.fullName,
        });
        await publishToQueue("user.welcome", {
            email: user.email,
            firstName: user.fullName.firstName,
        });

        // Issue tokens
        const accessToken = generateAccessToken(user._id);
        const refreshToken = await generateRefreshToken(user._id);
        setTokenCookies(res, accessToken, refreshToken);

        res.status(201).json({
            message: "Registration successful",
            user: {
                _id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─── Login ─────────────────────────────────────────────────────────────────────

export const loginController = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await userModel.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" }); // don't reveal which field is wrong
        }

        // Block Google-only users from password login
        if (user.googleId && !user.password) {
            return res.status(400).json({
                message: "This account uses Google Sign-In. Please log in with Google.",
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        if (!user.isVerified) {
            return res.status(403).json({ message: "Please verify your email before logging in." });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Issue tokens
        const accessToken = generateAccessToken(user._id);
        const refreshToken = await generateRefreshToken(user._id);
        setTokenCookies(res, accessToken, refreshToken);

        res.status(200).json({
            message: "Logged in successfully",
            user: {
                _id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─── Google OAuth Callback ─────────────────────────────────────────────────────

export const googleAuthCallbackController = async (req, res, next) => {
    try {
        await handleGoogleCallback(res, req.user);
    } catch (error) {
        next(error);
    }
};

// ─── Logout ────────────────────────────────────────────────────────────────────

export const logoutController = async (req, res, next) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(400).json({ message: "Already logged out" });
        }

        // Blacklist access token for its remaining TTL
        try {
            const decoded = jwt.verify(token, config.jwt_secret);
            const ttl = decoded.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
                await redis.set(`bl_${token}`, "1", "EX", ttl);
            }
        } catch {
            // Token already expired — no need to blacklist
        }

        // Delete refresh token from Redis
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            try {
                const decoded = jwt.verify(refreshToken, config.jwt_refresh_secret);
                await redis.del(`refresh_${decoded.id}`);
            } catch {
                // Refresh token expired or invalid — that's fine
            }
        }

        res.clearCookie("token");
        res.clearCookie("refreshToken");

        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        next(error);
    }
};

// ─── Logout All Devices ────────────────────────────────────────────────────────

export const logoutAllController = async (req, res, next) => {
    try {
        const userId = req.user._id;

        // Delete refresh token from Redis — all new requests will fail auth
        await redis.del(`refresh_${userId}`);

        res.clearCookie("token");
        res.clearCookie("refreshToken");

        res.status(200).json({ message: "Logged out from all devices" });
    } catch (error) {
        next(error);
    }
};

// ─── Refresh Token ─────────────────────────────────────────────────────────────

export const refreshTokenController = async (req, res, next) => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: "No refresh token provided" });
        }

        // Verify signature
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, config.jwt_refresh_secret);
        } catch {
            return res.status(401).json({ message: "Invalid or expired refresh token" });
        }

        // Check it still exists in Redis (not revoked)
        const storedToken = await redis.get(`refresh_${decoded.id}`);
        if (!storedToken || storedToken !== refreshToken) {
            return res.status(401).json({ message: "Refresh token revoked. Please log in again." });
        }

        // Issue new access token
        const newAccessToken = generateAccessToken(decoded.id);

        res.cookie("token", newAccessToken, {
            httpOnly: true,
            secure: config.node_env === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });

        res.status(200).json({ message: "Token refreshed" });
    } catch (error) {
        next(error);
    }
};

// ─── Forgot Password ───────────────────────────────────────────────────────────

export const forgotPasswordController = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await userModel.findOne({ email });

        // Always return same message to prevent email enumeration
        if (!user) {
            return res.status(200).json({ message: "If this email is registered, an OTP has been sent." });
        }

        // Block Google-only users
        if (user.googleId && !user.password) {
            return res.status(400).json({
                message: "This account uses Google Sign-In and has no password to reset.",
            });
        }

        const otp = generateOTP();
        await redis.set(`reset_${email}`, otp, "EX", 60 * 10); // 10 min expiry

        await publishToQueue("send_otp", {
            email,
            otp,
            firstName: user.fullName.firstName,
            type: "forgot_password",
        });

        res.status(200).json({ message: "If this email is registered, an OTP has been sent." });
    } catch (error) {
        next(error);
    }
};

// ─── Reset Password ────────────────────────────────────────────────────────────

export const resetPasswordController = async (req, res, next) => {
    try {
        const { email, otp, newPassword } = req.body;

        const cachedOtp = await redis.get(`reset_${email}`);
        if (!cachedOtp) {
            return res.status(400).json({ message: "OTP expired or invalid. Please request a new one." });
        }

        if (otp !== cachedOtp) {
            return res.status(400).json({ message: "Invalid OTP." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await userModel.findOneAndUpdate({ email }, { password: hashedPassword });

        await redis.del(`reset_${email}`);

        res.status(200).json({ message: "Password reset successfully. Please log in." });
    } catch (error) {
        next(error);
    }
};

// ─── Get Current User ──────────────────────────────────────────────────────────

export const getCurrentUserController = async (req, res, next) => {
    try {
        res.status(200).json({
            message: "User fetched successfully",
            user: req.user, // set by authMiddleware
        });
    } catch (error) {
        next(error);
    }
};

// ─── Update Profile ────────────────────────────────────────────────────────────

export const updateProfileController = async (req, res, next) => {
    try {
        const { firstName, lastName } = req.body;
        const avatar = req.file;
        const userId = req.user._id;

        const updates = {};
        if (firstName) updates["fullName.firstName"] = firstName;
        if (lastName) updates["fullName.lastName"] = lastName;

        if (avatar) {
            const uploaded = await uploadImage(avatar.buffer, avatar.originalname);
            updates.avatar = uploaded.url;
        }

        const user = await userModel.findByIdAndUpdate(userId, updates, { new: true });

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                _id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─── Check Email ───────────────────────────────────────────────────────────────

export const checkEmailController = async (req, res, next) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        const exists = await userModel.exists({ email: email.toLowerCase() });
        res.status(200).json({ exists: !!exists });
    } catch (error) {
        next(error);
    }
};
