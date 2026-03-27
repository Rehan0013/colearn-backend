import { body, query, validationResult } from "express-validator";

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

export const endSessionValidation = [
    body("roomId")
        .isMongoId().withMessage("Invalid room ID"),
    validate,
];

export const historyValidation = [
    query("page")
        .optional()
        .isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit")
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
    validate,
];

export const chartValidation = [
    query("range")
        .optional()
        .isIn(["week", "month"]).withMessage("Range must be 'week' or 'month'"),
    validate,
];