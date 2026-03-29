import Message from "../../models/message.model.js";
import config from "../../config/_config.js";
import { getPresentUsers } from "./presence.js";
import { uploadFile } from "../../services/storage.service.js";

const MAX_HISTORY = 50;
const ALLOWED_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉"];
const ALLOWED_FILE_TYPES = ["image", "audio", "video"];

/**
 * Events:
 *   chat:message       → client sends a message (text or file)
 *   chat:receive       → server broadcasts message to room
 *   chat:history       → server sends paginated messages to joining user
 *   chat:react         → client toggles a reaction on a message
 *   chat:react:update  → server broadcasts updated reactions to room
 *   chat:typing        → client is typing indicator
 *   chat:typing:update → server broadcasts typing status to room
 */
export const registerChatHandlers = (io, socket) => {
    const userId = socket.user.id;

    // ── Chat history (with cursor-based pagination) ───────────────────────────
    socket.on("chat:history", async ({ roomId, before }) => {
        try {
            const filter = { roomId };

            // Cursor-based: fetch messages before a given timestamp
            if (before) {
                filter.createdAt = { $lt: new Date(before) };
            }

            const messages = await Message.find(filter)
                .sort({ createdAt: -1 })
                .limit(MAX_HISTORY)
                .lean();

            const chronological = messages.reverse().map(m => {
                const doc = { ...m, id: m._id.toString() };
                delete doc._id;
                delete doc.__v;
                return doc;
            });

            socket.emit("chat:history", {
                roomId,
                messages: chronological,
                hasMore: messages.length === MAX_HISTORY,
            });
        } catch (error) {
            console.error("chat:history error:", error.message);
        }
    });

    // ── Send message ──────────────────────────────────────────────────────────
    socket.on("chat:message", async ({ roomId, content, fileBuffer, fileName, fileUrl, fileType }) => {
        try {
            // Must have either text content or a file/fileUrl
            if (!content?.trim() && !fileUrl && !fileBuffer) return;

            if (content && content.length > 500) {
                return socket.emit("chat:error", {
                    message: "Message too long (max 500 characters)",
                });
            }

            // If a file buffer is sent directly via socket, upload it first
            if (fileBuffer && fileName) {
                try {
                    fileUrl = await uploadFile(fileBuffer, fileName);
                    
                    // Auto-detect file type if not explicitly provided
                    if (!fileType) {
                        const lower = fileName.toLowerCase();
                        if (lower.match(/\.(jpeg|jpg|gif|png|webp|svg)$/)) fileType = "image";
                        else if (lower.match(/\.(mp4|webm|avi|mov)$/)) fileType = "video";
                        else if (lower.match(/\.(mp3|wav|ogg|m4a)$/)) fileType = "audio";
                    }
                } catch (error) {
                    console.error("Socket file upload error:", error);
                    return socket.emit("chat:error", { message: "Failed to upload file to ImageKit" });
                }
            }

            // Validate file type
            if (fileType && !ALLOWED_FILE_TYPES.includes(fileType)) {
                return socket.emit("chat:error", { message: "Invalid file type" });
            }

            // Validate fileUrl is from ImageKit only
            if (fileUrl && !fileUrl.startsWith(config.imagekit_url_endpoint)) {
                return socket.emit("chat:error", { message: "Invalid file source" });
            }

            // Fetch sender info from presence cache (if available)
            const presentUsers = await getPresentUsers(roomId);
            const senderInfo = presentUsers.find((u) => u.userId === userId);
            const userData = senderInfo ? { name: senderInfo.name, avatar: senderInfo.avatar } : { name: "Unknown", avatar: null };

            // Create message with persisted userData
            const messageDoc = await Message.create({
                roomId,
                userId,
                content: content?.trim() || "",
                fileUrl: fileUrl || null,
                fileType: fileType || null,
                userData,
            });

            // Broadcast to everyone in room including sender
            io.to(roomId).emit("chat:receive", messageDoc.toJSON());
        } catch (error) {
            console.error("chat:message error:", error.message);
        }
    });

    // ── React to a message ────────────────────────────────────────────────────
    socket.on("chat:react", async ({ roomId, messageId, emoji }) => {
        try {
            if (!ALLOWED_EMOJIS.includes(emoji)) return;

            const existing = await Message.findById(messageId).lean();
            if (!existing) return;

            // Check if user already has THIS specific emoji
            const alreadyHasThisEmoji = existing.reactions?.[emoji]?.includes(userId);

            // Step 1: Remove userId from ALL reaction arrays (Exclusive Reaction)
            const pullUpdate = {};
            ALLOWED_EMOJIS.forEach(e => {
                pullUpdate[`reactions.${e}`] = userId;
            });

            await Message.findByIdAndUpdate(messageId, { $pull: pullUpdate });

            let updatedMessage;
            if (alreadyHasThisEmoji) {
                // It was a toggle-off (already removed by $pull above)
                updatedMessage = await Message.findById(messageId).lean();
            } else {
                // It's a new reaction or changing from a different emoji
                updatedMessage = await Message.findByIdAndUpdate(
                    messageId,
                    { $addToSet: { [`reactions.${emoji}`]: userId } },
                    { new: true }
                ).lean();
            }

            // Strip empty reaction arrays before broadcasting
            const cleanedReactions = Object.fromEntries(
                Object.entries(updatedMessage.reactions || {}).filter(
                    ([, users]) => users.length > 0
                )
            );

            io.to(roomId).emit("chat:react:update", {
                roomId,
                messageId,
                reactions: cleanedReactions,
            });
        } catch (error) {
            console.error("chat:react error:", error.message);
        }
    });

    // ── Typing indicator (fire and forget — no DB/Redis) ─────────────────────
    socket.on("chat:typing", ({ roomId, userData, isTyping }) => {
        socket.to(roomId).emit("chat:typing:update", {
            roomId,
            userId,
            userData,
            isTyping,
        });
    });
};
