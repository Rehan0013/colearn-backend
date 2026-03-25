import { body, validationResult } from "express-validator";

// ─── Runner ────────────────────────────────────────────────────────────────────
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// ─── Reusable field validators ─────────────────────────────────────────────────
const emailField = body("email")
    .trim()
    .isEmail().withMessage("Invalid email address")
    .normalizeEmail(); // lowercases, strips gmail dots etc.

const passwordField = (field = "password") =>
    body(field)
        .isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
        .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase letter")
        .matches(/[0-9]/).withMessage("Password must contain at least one number");

const nameField = (field) =>
    body(field)
        .trim()
        .notEmpty().withMessage(`${field} is required`)
        .isAlpha().withMessage(`${field} must contain only letters`)
        .isLength({ min: 2, max: 30 }).withMessage(`${field} must be between 2 and 30 characters`);

const otpField = body("otp")
    .isLength({ min: 6, max: 6 }).withMessage("OTP must be exactly 6 digits")
    .isNumeric().withMessage("OTP must contain only numbers");

const avatarField = body("avatar").custom((value, { req }) => {
    if (req.file) {
        if (!req.file.mimetype.startsWith("image/")) {
            throw new Error("Avatar must be an image file");
        }
        if (req.file.size > 5 * 1024 * 1024) {
            throw new Error("Avatar must be less than 5MB");
        }
    }
    return true; // avatar is optional
});

// ─── Exported validators ───────────────────────────────────────────────────────

export const registerValidation = [
    emailField,
    passwordField(),
    nameField("firstName"),
    nameField("lastName"),
    avatarField,
    validate,
];

export const loginValidation = [
    emailField,
    passwordField(),
    validate,
];

export const verifyRegistrationValidation = [
    emailField,
    otpField,
    validate,
];

export const forgotPasswordValidation = [
    emailField,
    validate,
];

export const resetPasswordValidation = [
    emailField,
    otpField,
    passwordField("newPassword"),
    validate,
];

export const updateProfileValidation = [
    body("firstName")
        .optional()
        .trim()
        .isAlpha().withMessage("First name must contain only letters")
        .isLength({ min: 2, max: 30 }).withMessage("First name must be between 2 and 30 characters"),
    body("lastName")
        .optional()
        .trim()
        .isAlpha().withMessage("Last name must contain only letters")
        .isLength({ min: 2, max: 30 }).withMessage("Last name must be between 2 and 30 characters"),
    avatarField,
    validate,
];