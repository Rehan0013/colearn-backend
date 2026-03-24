import express from "express";
import passport from "passport";
import multer from "multer";

import { registerController, loginController, googleAuthCallbackController, logoutController, verifyRegistrationController, forgotPasswordController, getCurrentUserController } from "../controllers/auth.controller.js";

import { registerValidation, loginValidation, verifyRegistrationValidation, forgotPasswordValidation } from "../middlewares/validator.middleware.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";



const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post("/register", upload.single("avatar"), registerValidation, registerController);
router.post("/login", loginValidation, loginController);
router.get("/logout", logoutController);
router.post("/verify-registration", verifyRegistrationValidation, verifyRegistrationController);
router.post("/forgot-password", forgotPasswordValidation, forgotPasswordController);
router.get("/current-user", authMiddleware, getCurrentUserController);

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// Callback route that Google will redirect to after authentication
router.get('/google/callback',
    passport.authenticate('google', { session: false }),
    googleAuthCallbackController
);


export default router;