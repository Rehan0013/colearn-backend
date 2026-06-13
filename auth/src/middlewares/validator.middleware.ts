import { Request, Response, NextFunction } from "express";
import { z, ZodError, ZodObject } from "zod";

// ─── Base validation rules ─────────────────────────────────────────────────────

const emailSchema = z
    .string()
    .min(1, "Email is required")
    .trim()
    .email({ message: "Invalid email address" })
    .transform((val) => val.toLowerCase());

const passwordSchema = z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .regex(/[A-Z]/, { message: "Password must contain at least one uppercase letter" })
    .regex(/[0-9]/, { message: "Password must contain at least one number" });

const nameSchema = (fieldName: string) =>
    z
        .string()
        .min(1, `${fieldName} is required`)
        .trim()
        .min(2, { message: `${fieldName} must be between 2 and 30 characters` })
        .max(30, { message: `${fieldName} must be between 2 and 30 characters` })
        .regex(/^[a-zA-Z]+$/, { message: `${fieldName} must contain only letters` });

const optionalNameSchema = (fieldName: string) =>
    z
        .string()
        .trim()
        .regex(/^[a-zA-Z]+$/, { message: `${fieldName} must contain only letters` })
        .min(2, { message: `${fieldName} must be between 2 and 30 characters` })
        .max(30, { message: `${fieldName} must be between 2 and 30 characters` })
        .optional();

const otpSchema = z
    .string()
    .min(1, "OTP is required")
    .length(6, { message: "OTP must be exactly 6 digits" })
    .regex(/^[0-9]+$/, { message: "OTP must contain only numbers" });

// ─── Reusable Express Middleware Generator ─────────────────────────────────────

export const validate = (schema: z.ZodTypeAny, validateFileOption: boolean = false) => 
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (validateFileOption && req.file) {
                if (!req.file.mimetype.startsWith("image/")) {
                    return res.status(400).json({
                        errors: [{ msg: "Avatar must be an image file", path: "avatar", type: "field" }]
                    });
                }
                if (req.file.size > 5 * 1024 * 1024) {
                    return res.status(400).json({
                        errors: [{ msg: "Avatar must be less than 5MB", path: "avatar", type: "field" }]
                    });
                }
            }
            const parsed = await schema.parseAsync(req.body);
            req.body = parsed;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    errors: error.issues.map(err => ({
                        msg: err.message,
                        path: err.path.join("."),
                        type: "field"
                    }))
                });
            }
            next(error);
        }
    };

// ─── Schemas and Inferred Types ────────────────────────────────────────────────

export const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema("firstName"),
    lastName: nameSchema("lastName"),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyRegistrationSchema = z.object({
    email: emailSchema,
    otp: otpSchema,
});
export type VerifyRegistrationInput = z.infer<typeof verifyRegistrationSchema>;

export const forgotPasswordSchema = z.object({
    email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
    email: emailSchema,
    otp: otpSchema,
    newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const updateProfileSchema = z.object({
    firstName: optionalNameSchema("firstName"),
    lastName: optionalNameSchema("lastName"),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ─── Validation Middleware Arrays (compat layer for route file) ────────────────

export const registerValidation = [validate(registerSchema, true)];
export const loginValidation = [validate(loginSchema)];
export const verifyRegistrationValidation = [validate(verifyRegistrationSchema)];
export const forgotPasswordValidation = [validate(forgotPasswordSchema)];
export const resetPasswordValidation = [validate(resetPasswordSchema)];
export const updateProfileValidation = [validate(updateProfileSchema, true)];
