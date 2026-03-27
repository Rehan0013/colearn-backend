import { body, param, query, validationResult } from "express-validator";

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

const roomIdParam = param("roomId")
    .isMongoId().withMessage("Invalid room ID");

const versionIdParam = param("versionId")
    .isMongoId().withMessage("Invalid version ID");

export const saveNoteValidation = [
    roomIdParam,
    body("content")
        .notEmpty().withMessage("Content is required")
        .isLength({ max: 50000 }).withMessage("Content exceeds 50,000 character limit"),
    body("label")
        .optional()
        .trim()
        .isLength({ max: 100 }).withMessage("Label must be under 100 characters"),
    validate,
];

export const roomIdValidation = [roomIdParam, validate];

export const versionValidation = [roomIdParam, versionIdParam, validate];

export const exportValidation = [
    roomIdParam,
    query("format")
        .optional()
        .isIn(["md", "pdf"]).withMessage("Format must be 'md' or 'pdf'"),
    validate,
];