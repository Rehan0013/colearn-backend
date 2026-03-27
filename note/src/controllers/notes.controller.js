import Note from "../models/note.model.js";
import redis from "../db/redis.js";
import { saveNoteVersion } from "../utils/notes.util.js";
import { exportAsMarkdown, exportAsPDF } from "../utils/export.util.js";

const CACHE_TTL = 60 * 5; // 5 minutes

// ── Get note for a room ────────────────────────────────────────────────────────

export const getNoteController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const cacheKey = `note:${roomId}`;

        const cached = await redis.get(cacheKey);
        if (cached) {
            return res.status(200).json(JSON.parse(cached));
        }

        const note = await Note.findOne({ roomId }).select("-versions");

        // Return empty note if none exists yet — not a 404
        const response = {
            message: "Note fetched successfully",
            note: note ?? { roomId, content: "", lastEditedBy: null },
        };

        await redis.set(cacheKey, JSON.stringify(response), "EX", CACHE_TTL);

        res.status(200).json(response);
    } catch (error) {
        next(error);
    }
};

// ── Manual save ────────────────────────────────────────────────────────────────

export const saveNoteController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { content, label } = req.body;
        const userId = req.user.id;

        await saveNoteVersion({
            roomId,
            content,
            lastEditedBy: userId,
            updatedAt: new Date(),
            label: label ?? `Manual save`,
        });

        // Invalidate cache
        await redis.del(`note:${roomId}`);

        res.status(200).json({ message: "Note saved successfully" });
    } catch (error) {
        next(error);
    }
};

// ── Get version history ────────────────────────────────────────────────────────

export const getVersionHistoryController = async (req, res, next) => {
    try {
        const { roomId } = req.params;

        const note = await Note.findOne({ roomId }).select("versions versionCount");
        if (!note) {
            return res.status(404).json({ message: "No note found for this room" });
        }

        // Return versions newest first, strip full content to keep response light
        const versions = [...note.versions]
            .reverse()
            .map((v) => ({
                id: v._id,
                savedBy: v.savedBy,
                savedAt: v.savedAt,
                label: v.label,
                preview: v.content.slice(0, 100) + (v.content.length > 100 ? "..." : ""),
            }));

        res.status(200).json({
            message: "Version history fetched",
            versionCount: note.versionCount,
            versions,
        });
    } catch (error) {
        next(error);
    }
};

// ── Get a specific version's full content ──────────────────────────────────────

export const getVersionController = async (req, res, next) => {
    try {
        const { roomId, versionId } = req.params;

        const note = await Note.findOne({ roomId });
        if (!note) {
            return res.status(404).json({ message: "No note found for this room" });
        }

        const version = note.versions.id(versionId);
        if (!version) {
            return res.status(404).json({ message: "Version not found" });
        }

        res.status(200).json({
            message: "Version fetched",
            version: {
                id: version._id,
                content: version.content,
                savedBy: version.savedBy,
                savedAt: version.savedAt,
                label: version.label,
            },
        });
    } catch (error) {
        next(error);
    }
};

// ── Restore a version ──────────────────────────────────────────────────────────

export const restoreVersionController = async (req, res, next) => {
    try {
        const { roomId, versionId } = req.params;
        const userId = req.user.id;

        const note = await Note.findOne({ roomId });
        if (!note) {
            return res.status(404).json({ message: "No note found for this room" });
        }

        const version = note.versions.id(versionId);
        if (!version) {
            return res.status(404).json({ message: "Version not found" });
        }

        // Save current content as a version before overwriting
        await saveNoteVersion({
            roomId,
            content: version.content,
            lastEditedBy: userId,
            updatedAt: new Date(),
            label: `Restored from ${new Date(version.savedAt).toLocaleDateString()}`,
        });

        await redis.del(`note:${roomId}`);

        res.status(200).json({
            message: "Version restored successfully",
            content: version.content,
        });
    } catch (error) {
        next(error);
    }
};

// ── Export note ────────────────────────────────────────────────────────────────

export const exportNoteController = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const { format } = req.query; // "md" or "pdf"

        const note = await Note.findOne({ roomId }).select("content");
        if (!note || !note.content) {
            return res.status(404).json({ message: "No note content to export" });
        }

        if (format === "pdf") {
            await exportAsPDF(res, note.content, roomId);
        } else {
            // Default to markdown
            exportAsMarkdown(res, note.content, roomId);
        }
    } catch (error) {
        next(error);
    }
};