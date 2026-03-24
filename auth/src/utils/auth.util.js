import bcrypt from "bcryptjs";
import redis from "../db/redis.js";
import { generateOTP } from "./otp.js";
import { publishToQueue } from "../broker/rabbit.js";
import userModel from "../models/user.model.js";
import config from "../config/_config.js";
import jwt from "jsonwebtoken";

import { uploadImage } from "../services/storage.service.js";
/**
 * Handles the common registration logic: checking user existence, generating OTP,
 * hashing password, storing data in Redis, and publishing OTP event.
 * 
 * @param {Object} params - Registration parameters
 * @param {string} params.email - User email
 * @param {string} params.password - User password
 * @param {string} params.firstName - User first name
 * @param {string} params.lastName - User last name
 * @returns {Promise<void>}
 */
const handleRegistration = async ({ email, password, firstName, lastName, avatar }) => {
    // check user exist or not
    const isUserExist = await userModel.findOne({ email });
    if (isUserExist) {
        const error = new Error("User already exists");
        error.statusCode = 400;
        throw error;
    }

    // generate otp
    const otp = generateOTP();

    // upload avatar to imagekit
    const uploadedImage = await uploadImage(avatar.buffer, avatar.originalname);

    // Store user data and OTP in Redis with 10 minutes expiration
    const userData = {
        email,
        password,
        firstName,
        lastName,
        avatar: uploadedImage.url
    };

    // Hash password before storing in Redis to avoid plain text storage
    const hashedPassword = await bcrypt.hash(password, 10);
    userData.password = hashedPassword;

    // Store user data and OTP in Redis with 10 minutes expiration
    await redis.set(`reg_${email}`, JSON.stringify({ userData, otp }), "EX", 60 * 10);

    // Publish to queue to send email
    await publishToQueue("send_otp", {
        email,
        otp,
        fullName: { firstName, lastName },
        type: "registration"
    });
};

const handleGoogleCallback = async (res, user) => {
    // check user exist
    console.log(user);
    let targetUser = await userModel.findOne({ $or: [{ email: user.emails[0].value }, { googleId: user.id }] });

    if (!targetUser) {
        // create new user
        targetUser = await userModel.create({
            email: user.emails[0].value,
            googleId: user.id,
            fullName: { firstName: user.name.givenName, lastName: user.name.familyName },
            avatar: user.photos[0].value,
        });

        // publish to queue to create user in database
        await publishToQueue("user_created", {
            id: targetUser._id,
            email: targetUser.email,
            fullName: targetUser.fullName,
        });
    }

    // generate token with 2 days expiry
    const token = jwt.sign({ id: targetUser._id, firstName: targetUser.fullName.firstName, lastName: targetUser.fullName.lastName, avatar: targetUser.avatar }, config.jwt_secret, {
        expiresIn: "2d",
    });

    // set token in cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 2 * 24 * 60 * 60 * 1000,
    });

    res.redirect("http://localhost:5173");
};

export { handleRegistration, handleGoogleCallback };
