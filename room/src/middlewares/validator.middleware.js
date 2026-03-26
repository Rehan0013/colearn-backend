import { body, param, query, validationResult } from "express-validator";

const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

// ─── Reusable ──────────────────────────────────────────────────────────────────

const roomIdParam = param("roomId")
    .isMongoId().withMessage("Invalid room ID");

const memberIdParam = param("memberId")
    .isMongoId().withMessage("Invalid member ID");

// ─── Validators ────────────────────────────────────────────────────────────────

export const createRoomValidation = [
    body("name")
        .trim()
        .notEmpty().withMessage("Room name is required")
        .isLength({ min: 3, max: 50 }).withMessage("Room name must be between 3 and 50 characters"),
    body("subject")
        .trim()
        .notEmpty().withMessage("Subject is required")
        .isLength({ max: 50 }).withMessage("Subject must be under 50 characters"),
    body("description")
        .optional()
        .trim()
        .isLength({ max: 200 }).withMessage("Description must be under 200 characters"),
    body("isPrivate")
        .optional()
        .isBoolean().withMessage("isPrivate must be a boolean"),
    body("maxMembers")
        .optional()
        .isInt({ min: 2, max: 50 }).withMessage("Max members must be between 2 and 50"),
    body("tags")
        .optional()
        .isArray().withMessage("Tags must be an array")
        .custom((tags) => tags.every((t) => typeof t === "string"))
        .withMessage("Each tag must be a string"),
    validate,
];

export const joinRoomValidation = [
    body("inviteCode")
        .trim()
        .notEmpty().withMessage("Invite code is required")
        .isLength({ min: 8, max: 8 }).withMessage("Invalid invite code format"),
    validate,
];

export const updateRoomValidation = [
    roomIdParam,
    body("name")
        .optional()
        .trim()
        .isLength({ min: 3, max: 50 }).withMessage("Room name must be between 3 and 50 characters"),
    body("subject")
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage("Subject must be under 50 characters"),
    body("description")
        .optional()
        .trim()
        .isLength({ max: 200 }).withMessage("Description must be under 200 characters"),
    body("isPrivate")
        .optional()
        .isBoolean().withMessage("isPrivate must be a boolean"),
    body("maxMembers")
        .optional()
        .isInt({ min: 2, max: 50 }).withMessage("Max members must be between 2 and 50"),
    body("tags")
        .optional()
        .isArray().withMessage("Tags must be an array"),
    validate,
];

export const roomIdValidation = [roomIdParam, validate];

export const kickMemberValidation = [roomIdParam, memberIdParam, validate];

export const getPublicRoomsValidation = [
    query("page")
        .optional()
        .isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit")
        .optional()
        .isInt({ min: 1, max: 50 }).withMessage("Limit must be between 1 and 50"),
    query("subject")
        .optional()
        .trim()
        .isLength({ max: 50 }).withMessage("Subject filter too long"),
    validate,
];