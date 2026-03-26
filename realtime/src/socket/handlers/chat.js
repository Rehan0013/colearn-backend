import redis from "../../db/redis.js";
import { publishToQueue } from "../../broker/rabbit.js";

const MAX_HISTORY = 50;       // messages kept in Redis per room
const HISTORY_TTL = 60 * 60 * 24; // 24 hours

/**
 * Redis key: chat:{roomId} → JSON array of last 50 messages
 *
 * Events:
 *   chat:message      → client sends a message
 *   chat:receive      → server broadcasts message to room
 *   chat:history      → server sends recent messages to a joining user
 *   chat:react        → client adds a reaction to a message
 *   chat:react:update → server broadcasts updated reactions to room
 *   chat:typing       → client is typing
 *   chat:typing:update → server broadcasts who is typing
 */
export const registerChatHandlers = (io, socket) => {
    const userId = socket.user.id;

    // ── Get chat history (on room join) ──────────────────────────────────────
    socket.on("chat:history", async ({ roomId }) => {
        try {
            const messages = await getChatHistory(roomId);
            socket.emit("chat:history", { roomId, messages });
        } catch (error) {
            console.error("chat:history error:", error.message);
        }
    });

    // ── Send message ─────────────────────────────────────────────────────────
    socket.on("chat:message", async ({ roomId, content, userData }) => {
        try {
            if (!content?.trim()) return;
            if (content.length > 500) {
                return socket.emit("chat:error", { message: "Message too long (max 500 characters)" });
            }

            const message = {
                id: `${Date.now()}-${userId}`,
                roomId,
                userId,
                userData,       // { name, avatar } — sent from client to avoid DB call
                content: content.trim(),
                reactions: {},  // { emoji: [userId, ...] }
                createdAt: new Date().toISOString(),
            };

            // Persist to Redis history
            await appendToHistory(roomId, message);

            // Broadcast to everyone in the room including sender
            io.to(roomId).emit("chat:receive", message);
        } catch (error) {
            console.error("chat:message error:", error.message);
        }
    });

    // ── React to a message ───────────────────────────────────────────────────
    socket.on("chat:react", async ({ roomId, messageId, emoji }) => {
        try {
            const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉"];
            if (!ALLOWED_EMOJIS.includes(emoji)) return;

            const messages = await getChatHistory(roomId);
            const message = messages.find((m) => m.id === messageId);
            if (!message) return;

            // Toggle reaction — add if not there, remove if already reacted
            if (!message.reactions[emoji]) {
                message.reactions[emoji] = [];
            }

            const index = message.reactions[emoji].indexOf(userId);
            if (index === -1) {
                message.reactions[emoji].push(userId);
            } else {
                message.reactions[emoji].splice(index, 1);
                if (message.reactions[emoji].length === 0) {
                    delete message.reactions[emoji];
                }
            }

            // Save updated history back to Redis
            await redis.set(
                `chat:${roomId}`,
                JSON.stringify(messages),
                "EX",
                HISTORY_TTL
            );

            // Broadcast updated reactions to room
            io.to(roomId).emit("chat:react:update", {
                roomId,
                messageId,
                reactions: message.reactions,
            });
        } catch (error) {
            console.error("chat:react error:", error.message);
        }
    });

    // ── Typing indicator ─────────────────────────────────────────────────────
    socket.on("chat:typing", ({ roomId, userData, isTyping }) => {
        // Broadcast to others only (not sender)
        socket.to(roomId).emit("chat:typing:update", {
            roomId,
            userId,
            userData,
            isTyping,
        });
    });
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const getChatHistory = async (roomId) => {
    const data = await redis.get(`chat:${roomId}`);
    return data ? JSON.parse(data) : [];
};

const appendToHistory = async (roomId, message) => {
    const messages = await getChatHistory(roomId);
    messages.push(message);

    // Keep only last MAX_HISTORY messages
    if (messages.length > MAX_HISTORY) {
        messages.splice(0, messages.length - MAX_HISTORY);
    }

    await redis.set(`chat:${roomId}`, JSON.stringify(messages), "EX", HISTORY_TTL);
};