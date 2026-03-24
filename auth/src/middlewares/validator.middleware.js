import { body, validationResult } from "express-validator";

async function validate(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
}

export const registerValidation = [
    body("email").isEmail().withMessage("Invalid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
    body("firstName").notEmpty().withMessage("First name is required"),
    body("lastName").notEmpty().withMessage("Last name is required"),
    body("avatar").custom((value, { req }) => {
        if (!req.file) {
            throw new Error("Avatar is required");
        }
        if (!req.file.mimetype.startsWith("image/")) {
            throw new Error("Avatar must be an image");
        }
        return true;
    }),
    validate,
];

export const loginValidation = [
    body("email").isEmail().withMessage("Invalid email"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters long"),
    validate,
];

export const verifyRegistrationValidation = [
    body("email").isEmail().withMessage("Invalid email"),
    body("otp").isLength({ min: 6 }).withMessage("OTP must be at least 6 characters long"),
    validate,
];

export const forgotPasswordValidation = [
    body("email").isEmail().withMessage("Invalid email"),
    validate,
];