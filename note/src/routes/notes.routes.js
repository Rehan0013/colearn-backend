import express from "express";
import {
    getNoteController,
    saveNoteController,
    getVersionHistoryController,
    getVersionController,
    restoreVersionController,
    exportNoteController,
} from "../controllers/notes.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
    saveNoteValidation,
    roomIdValidation,
    versionValidation,
    exportValidation,
} from "../middlewares/validator.middleware.js";

const router = express.Router();

router.use(authMiddleware); // all notes routes require auth

// ── Note CRUD ──────────────────────────────────────────────────────────────────
router.get("/:roomId", roomIdValidation, getNoteController);
router.post("/:roomId/save", saveNoteValidation, saveNoteController);

// ── Version history ────────────────────────────────────────────────────────────
router.get("/:roomId/history", roomIdValidation, getVersionHistoryController);
router.get("/:roomId/history/:versionId", versionValidation, getVersionController);
router.post("/:roomId/history/:versionId/restore", versionValidation, restoreVersionController);

// ── Export ─────────────────────────────────────────────────────────────────────
router.get("/:roomId/export", exportValidation, exportNoteController);
// GET /api/notes/:roomId/export?format=md
// GET /api/notes/:roomId/export?format=pdf

export default router;