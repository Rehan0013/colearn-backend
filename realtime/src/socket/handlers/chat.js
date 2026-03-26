import Message from "../../models/message.model.js";

const MAX_HISTORY = 50;       // messages kept per room

/**
 * MongoDB Model: Message
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
    socket.on("chat:message", async ({ roomId, content, fileUrl, fileType, userData }) => {
        try {
            if (!content?.trim() && !fileUrl) return;
            if (content && content.length > 500) {
                return socket.emit("chat:error", { message: "Message too long (max 500 characters)" });
            }

            const messageDoc = await Message.create({
                roomId,
                userId,
                userData,
                content: content?.trim() || "",
                fileUrl,
                fileType,
            });

            // Clean up to plain object before broadcasting
            const message = messageDoc.toJSON();

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

            const messageDoc = await Message.findById(messageId);
            if (!messageDoc) return;

            // Handle reactions map
            const reactions = messageDoc.reactions || {};
            if (!reactions[emoji]) {
                reactions[emoji] = [];
            }

            const index = reactions[emoji].indexOf(userId);
            if (index === -1) {
                reactions[emoji].push(userId);
            } else {
                reactions[emoji].splice(index, 1);
                if (reactions[emoji].length === 0) {
                    delete reactions[emoji];
                }
            }

            // Must mark mixed type as modified
            messageDoc.markModified('reactions');
            await messageDoc.save();

            // Broadcast updated reactions to room
            io.to(roomId).emit("chat:react:update", {
                roomId,
                messageId,
                reactions: messageDoc.reactions,
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
    const docs = await Message.find({ roomId })
        .sort({ createdAt: -1 }) // Sort descending to get latest
        .limit(MAX_HISTORY)
        .lean();

    // Reverse to return them in chronological order
    const chronological = docs.reverse();
    
    return chronological.map((doc) => {
        // Ensure consistent ID usage for the frontend
        doc.id = doc._id.toString();
        delete doc._id;
        delete doc.__v;
        return doc;
    });
};