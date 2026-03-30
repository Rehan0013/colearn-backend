import redis from "../../db/redis.js";
import { publishToQueue } from "../../broker/rabbit.js";

const NOTES_TTL = 60 * 60 * 24 * 7; // 7 days
const SAVE_DEBOUNCE_MS = 2000;       // persist to notes-service after 2s of inactivity

/**
 * Redis key: notes:{roomId} → current note content string
 *
 * Strategy — operational simplicity over OT (Operational Transform):
 * Last write wins. Works well for study notes where conflicts are rare.
 * Full OT (like Google Docs) would require a dedicated CRDT library.
 *
 * Events:
 *   notes:get         → client requests current note content
 *   notes:update      → client sends note changes
 *   notes:broadcast   → server sends updated note to all others in room
 *   notes:saved       → server confirms note was persisted
 *   notes:cursor      → client sends their cursor position
 *   notes:cursor:update → server broadcasts cursor positions to room
 */

// Debounce timers per room — avoid hammering notes-service on every keystroke
const saveTimers = new Map();

export const registerNotesHandlers = (io, socket) => {
    const userId = socket.user.id;

    // ── Get current note ─────────────────────────────────────────────────────
    socket.on("notes:get", async ({ roomId }) => {
        try {
            const content = await getNote(roomId);
            socket.emit("notes:content", { roomId, content });
        } catch (error) {
            console.error("notes:get error:", error.message);
        }
    });

    // ── User updates note ────────────────────────────────────────────────────
    socket.on("notes:update", async ({ roomId, content, userData }) => {
        try {
            // Check membership
            const isPresent = await redis.exists(`presence:${roomId}:${userId}`);
            if (!isPresent) return;

            if (typeof content !== "string") return;
            if (content.length > 50000) {
                return socket.emit("notes:error", { message: "Note exceeds maximum size (50,000 characters)" });
            }

            // Save to Redis immediately
            await redis.set(`notes:${roomId}`, content, "EX", NOTES_TTL);

            // Broadcast to all OTHER users in the room
            socket.to(roomId).emit("notes:broadcast", {
                roomId,
                content,
                editedBy: { userId, ...userData },
                updatedAt: new Date().toISOString(),
            });

            // Debounce persist to notes-service
            schedulePersist(roomId, content, userId);
        } catch (error) {
            console.error("notes:update error:", error.message);
        }
    });

    // ── Cursor position (shows where each user is editing) ───────────────────
    socket.on("notes:cursor", async ({ roomId, position, userData }) => {
        // Membership check
        const isPresent = await redis.exists(`presence:${roomId}:${userId}`);
        if (!isPresent) return;

        socket.to(roomId).emit("notes:cursor:update", {
            roomId,
            userId,
            userData,
            position, // { line, column } or character index
        });
    });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getNote = async (roomId) => {
    const content = await redis.get(`notes:${roomId}`);
    return content ?? "";
};

/**
 * Debounced persist — waits 2s after last update before
 * publishing to notes-service via RabbitMQ
 */
const schedulePersist = (roomId, content, userId) => {
    // Clear existing timer for this room
    if (saveTimers.has(roomId)) {
        clearTimeout(saveTimers.get(roomId));
    }

    const timer = setTimeout(async () => {
        try {
            await publishToQueue("notes.save", {
                roomId,
                content,
                lastEditedBy: userId,
                updatedAt: new Date().toISOString(),
            });
            saveTimers.delete(roomId);
        } catch (error) {
            console.error("notes persist failed:", error.message);
        }
    }, SAVE_DEBOUNCE_MS);

    saveTimers.set(roomId, timer);
};