// import models
import userModel from "../models/user.model.js";

// import packages
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// import config
import config from "../config/_config.js";

// import broker
import { publishToQueue } from "../broker/rabbit.js";

// import redis
import redis from "../db/redis.js";

// import utils
import { generateOTP } from "../utils/otp.js";
import { handleRegistration, handleGoogleCallback } from "../utils/auth.util.js";

const registerController = async (req, res, next) => {
    try {
        const { email, password, firstName, lastName } = req.body;
        const avatar = req.file;
        await handleRegistration({ email, password, firstName, lastName, avatar });
        res.status(200).json({ message: "OTP sent to your email. Please verify to complete registration." });
    } catch (error) {
        next(error);
    }
};

const loginController = async (req, res) => {
    const { email, password } = req.body;

    // check user exist or not
    const user = await userModel.findOne({ email });
    if (!user) {
        return res.status(400).json({ message: "User not found. Please register" });
    }

    // check password valid or not
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(400).json({ message: "Invalid password. Please try again" });
    }

    // generate token with 2 days expiry
    const token = jwt.sign({ id: user._id, firstName: user.fullName.firstName, lastName: user.fullName.lastName, avatar: user.avatar }, config.jwt_secret, {
        expiresIn: "2d",
    });

    // set token in cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 2 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
        message: "User logged in successfully",
        user: {
            _id: user._id,
            email: user.email,
            fullName: user.fullName,
            avatar: user.avatar,
        },
    });
};

const googleAuthCallbackController = async (req, res, next) => {
    try {
        await handleGoogleCallback(res, req.user);
    } catch (error) {
        next(error);
    }
};


const logoutController = async (req, res) => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

        // check token exist or not
        if (!token) {
            return res.status(400).json({ message: "User Already Logged Out" });
        }

        // add token to blacklist
        await redis.set(`bl_${token}`, token, "EX", 60 * 60 * 24 * 2);

        // clear token from cookie
        res.clearCookie("token");

        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const verifyRegistrationController = async (req, res) => {
    try {
        const { email, otp } = req.body;

        // check otp exist or not
        const cachedData = await redis.get(`reg_${email}`);
        if (!cachedData) {
            return res.status(400).json({ message: "OTP expired or invalid" });
        }

        const { userData, otp: cachedOtp } = JSON.parse(cachedData);

        // check otp valid or not
        if (otp !== cachedOtp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // create user using the role stored in Redis (default to 'user' if missing for backward compatibility)
        const user = await userModel.create({
            email: userData.email,
            password: userData.password,
            fullName: {
                firstName: userData.firstName,
                lastName: userData.lastName
            },
            avatar: userData.avatar,
        });

        // generate token with 2 days expiry
        const token = jwt.sign({ id: user._id, firstName: user.fullName.firstName, lastName: user.fullName.lastName, avatar: user.avatar }, config.jwt_secret, {
            expiresIn: "2d",
        });

        // publish to queue to create user in database
        await publishToQueue("user_created", {
            id: user._id,
            email: user.email,
            fullName: user.fullName,
        });

        // set token in cookie
        res.cookie("token", token, {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            maxAge: 2 * 24 * 60 * 60 * 1000,
        });

        // clear otp from redis
        await redis.del(`reg_${email}`);

        res.status(201).json({
            message: "User registered successfully",
            user: {
                _id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar,
            },
        });

    } catch (error) {
        console.error("Verify Registration error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const forgotPasswordController = async (req, res) => {
    try {
        const { email } = req.body;

        // check user exist or not
        const user = await userModel.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // generate otp
        const otp = generateOTP();

        // store otp in redis with 10 minutes expiry
        await redis.set(`reset_${email}`, otp, "EX", 60 * 10);

        // publish to queue to send otp
        await publishToQueue("send_otp", {
            email,
            otp,
            firstName: user.fullName.firstName,
            type: "forgot_password"
        });

        res.status(200).json({ message: "OTP sent to your email" });

    } catch (error) {
        console.error("Forgot Password error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const resetPasswordController = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        // check otp exist or not
        const cachedOtp = await redis.get(`reset_${email}`);
        if (!cachedOtp) {
            return res.status(400).json({ message: "OTP expired or invalid" });
        }

        // compare otp
        if (otp !== cachedOtp) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        // hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // update password
        await userModel.findOneAndUpdate({ email }, { password: hashedPassword });

        // clear otp from redis
        await redis.del(`reset_${email}`);

        res.status(200).json({ message: "Password reset successfully" });

    } catch (error) {
        console.error("Reset Password error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

const getCurrentUserController = async (req, res) => {
    try {
        res.status(200).json({
            message: "User fetched successfully",
            user: req.user
        });
    } catch (error) {
        console.error("Get Current User error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export {
    registerController,
    loginController,
    googleAuthCallbackController,
    logoutController,
    verifyRegistrationController,
    forgotPasswordController,
    resetPasswordController,
    getCurrentUserController
};
