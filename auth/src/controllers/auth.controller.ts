import { Request, Response, NextFunction } from "express";
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
import {
    RegisterInput,
    VerifyRegistrationInput,
    LoginInput,
    ForgotPasswordInput,
    ResetPasswordInput,
    UpdateProfileInput,
} from "../middlewares/validator.middleware.js";

// ─── Register ──────────────────────────────────────────────────────────────────

export const registerController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { email, password, firstName, lastName } = req.body as RegisterInput;
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

export const verifyRegistrationController = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const { email, otp } = req.body as VerifyRegistrationInput;

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
        await redis.del(`otp_count:${email}`);
        await redis.del(`otp_cooldown:${email}`);

        // Publish events
        await publishToQueue("user_created", {
            id: user._id,
            email: user.email,
            fullName: user.fullName,
        });
        await publishToQueue("user.welcome", {
            email: user.email,
            fullName: user.fullName,
        });

        // Issue tokens
        const accessToken = generateAccessToken(user);
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

export const loginController = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const { email, password } = req.body as LoginInput;

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

        if (!user.password) {
            return res.status(400).json({ message: "Invalid email or password" });
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
        const accessToken = generateAccessToken(user);
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

export const googleAuthCallbackController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await handleGoogleCallback(res, req.user);
    } catch (error) {
        next(error);
    }
};

// ─── Logout ────────────────────────────────────────────────────────────────────

export const logoutController = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(400).json({ message: "Already logged out" });
        }

        // Blacklist access token for its remaining TTL
        try {
            const decoded = jwt.verify(token, config.jwt_secret) as jwt.JwtPayload;
            if (decoded.exp) {
                const ttl = decoded.exp - Math.floor(Date.now() / 1000);
                if (ttl > 0) {
                    const hashedToken = await bcrypt.hash(token, 12);
                    await redis.set(`bl_${hashedToken}`, "1", "EX", ttl);
                }
            }
        } catch {
            // Token already expired — no need to blacklist
        }

        // Delete refresh token from Redis
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            try {
                const decoded = jwt.verify(refreshToken, config.jwt_refresh_secret) as jwt.JwtPayload;
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

export const logoutAllController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user!._id;

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

export const refreshTokenController = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: "No refresh token provided" });
        }

        // Verify signature
        let decoded: jwt.JwtPayload;
        try {
            decoded = jwt.verify(refreshToken, config.jwt_refresh_secret) as jwt.JwtPayload;
        } catch {
            return res.status(401).json({ message: "Invalid or expired refresh token" });
        }

        // Retrieve hash from Redis
        const storedHash = await redis.get(`refresh_${decoded.id}`);
        if (!storedHash) {
            return res.status(401).json({ message: "Refresh token revoked. Please log in again." });
        }

        // Compare presented token with stored hash
        const isValid = await bcrypt.compare(refreshToken, storedHash);
        if (!isValid) {
            return res.status(401).json({ message: "Invalid or expired refresh token" });
        }

        // Token is valid: rotate refresh token
        await redis.del(`refresh_${decoded.id}`); // remove old hash

        // Fetch user
        const user = await userModel.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: "User no longer exists." });
        }

        // Generate new tokens
        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = await generateRefreshToken(user._id); // generates and stores hash

        const isProduction = config.node_env === "production";
        res.cookie("token", newAccessToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: 15 * 60 * 1000,
            path: "/",
        });

        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: "/",
        });

        res.status(200).json({ message: "Token refreshed" });
    } catch (error) {
        next(error);
    }
};

// ─── Forgot Password ───────────────────────────────────────────────────────────

export const forgotPasswordController = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const { email } = req.body as ForgotPasswordInput;

        // ─── OTP Send Limit Check ───
        const cooldownKey = `otp_cooldown:${email}`;
        const countKey = `otp_count:${email}`;

        // 1. Cooldown check (60 seconds)
        const hasCooldown = await redis.exists(cooldownKey);
        if (hasCooldown) {
            return res.status(429).json({ message: "Please wait 1 minute before requesting another OTP." });
        }

        // 2. Max attempts check (3 attempts per 10 minutes)
        const currentCount = await redis.get(countKey);
        if (currentCount && parseInt(currentCount, 10) >= 3) {
            return res.status(429).json({ message: "Maximum OTP limit reached. Please try again in 10 minutes." });
        }

        const user = await userModel.findOne({ email });

        // Always return same message to prevent email enumeration
        if (!user) {
            // Increment limit count and set cooldown for non-existing email to prevent spam
            const newCount = await redis.incr(countKey);
            if (newCount === 1) {
                await redis.expire(countKey, 600); // 10 minutes
            }
            await redis.set(cooldownKey, "1", "EX", 60);

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

        // ─── Apply OTP Send Limits ───
        const newCount = await redis.incr(countKey);
        if (newCount === 1) {
            await redis.expire(countKey, 600); // 10 minutes
        }
        await redis.set(cooldownKey, "1", "EX", 60); // 1 minute cooldown

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

export const resetPasswordController = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const { email, otp, newPassword } = req.body as ResetPasswordInput;

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
        await redis.del(`otp_count:${email}`);
        await redis.del(`otp_cooldown:${email}`);

        res.status(200).json({ message: "Password reset successfully. Please log in." });
    } catch (error) {
        next(error);
    }
};

// ─── Get Current User ──────────────────────────────────────────────────────────

export const getCurrentUserController = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

export const updateProfileController = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const { firstName, lastName } = req.body as UpdateProfileInput;
        const avatar = req.file;
        const userId = req.user!._id;

        const updates = {} as any;
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
                _id: user?._id,
                email: user?.email,
                fullName: user?.fullName,
                avatar: user?.avatar,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ─── Check Email ───────────────────────────────────────────────────────────────

export const checkEmailController = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const email = req.query.email as string;
        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }
        const exists = await userModel.exists({ email: email.toLowerCase() });
        res.status(200).json({ exists: !!exists });
    } catch (error) {
        next(error);
    }
};
