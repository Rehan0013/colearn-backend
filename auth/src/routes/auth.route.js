import express from "express";
import passport from "passport";
import multer from "multer";

import {
    registerController,
    loginController,
    googleAuthCallbackController,
    logoutController,
    logoutAllController,
    refreshTokenController,
    verifyRegistrationController,
    forgotPasswordController,
    resetPasswordController,
    getCurrentUserController,
    updateProfileController,
    checkEmailController,
} from "../controllers/auth.controller.js";

import {
    registerValidation,
    loginValidation,
    verifyRegistrationValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
    updateProfileValidation,
} from "../middlewares/validator.middleware.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// ─── Email / Password Auth ─────────────────────────────────────────────────────
router.post("/register", upload.single("avatar"), registerValidation, registerController);
router.post("/verify-registration", verifyRegistrationValidation, verifyRegistrationController);
router.post("/login", loginValidation, loginController);
router.get("/logout", logoutController);
router.post("/logout-all", authMiddleware, logoutAllController);

// ─── Token Management ──────────────────────────────────────────────────────────
router.post("/refresh-token", refreshTokenController);

// ─── Password Reset ────────────────────────────────────────────────────────────
router.post("/forgot-password", forgotPasswordValidation, forgotPasswordController);
router.post("/reset-password", resetPasswordValidation, resetPasswordController);

// ─── User ──────────────────────────────────────────────────────────────────────
router.get("/current-user", authMiddleware, getCurrentUserController);
router.patch("/update-profile", authMiddleware, upload.single("avatar"), updateProfileValidation, updateProfileController);
router.get("/check-email", checkEmailController);

// ─── Google OAuth ──────────────────────────────────────────────────────────────
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=google_failed` }),
    googleAuthCallbackController
);

export default router;