import redis from "../../db/redis.js";
import { publishToQueue } from "../../broker/rabbit.js";

const PRESENCE_TTL = 60 * 60 * 2; // 2 hours

/**
 * Redis key: presence:{roomId} → Set of userIds currently online
 *
 * Events emitted:
 *   presence:update  → sent to room when someone joins/leaves
 */
export const registerPresenceHandlers = (io, socket) => {
    const userId = socket.user.id;

    // ── User joins a room ────────────────────────────────────────────────────
    socket.on("presence:join", async ({ roomId, userData, subject }) => {
        try {
            socket.join(roomId);
            socket.currentRoom = roomId;
            socket.currentSubject = subject ?? "General";

            // Store user presence in Redis
            await redis.set(
                `presence:${roomId}:${userId}`,
                JSON.stringify({ userId, ...userData }),
                "EX",
                PRESENCE_TTL
            );

            // Fetch all present users in this room
            const presentUsers = await getPresentUsers(roomId);

            // Tell everyone in the room (including the joiner) the updated list
            io.to(roomId).emit("presence:update", { roomId, users: presentUsers });

            // Notify others that this user joined
            socket.to(roomId).emit("presence:joined", {
                roomId,
                user: { userId, ...userData },
            });

            // Notify session-service to start tracking
            publishToQueue("session.started", {
                userId,
                roomId,
                subject: socket.currentSubject,
            }).catch(() => { });
        } catch (error) {
            console.error("presence:join error:", error.message);
        }
    });

    // ── User leaves a room ───────────────────────────────────────────────────
    socket.on("presence:leave", async ({ roomId }) => {
        await handleLeave(io, socket, roomId, userId);
    });

    // ── Cleanup on disconnect ────────────────────────────────────────────────
    socket.on("disconnect", async () => {
        if (socket.currentRoom) {
            await handleLeave(io, socket, socket.currentRoom, userId);
        }
    });
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const handleLeave = async (io, socket, roomId, userId) => {
    try {
        socket.leave(roomId);
        await redis.del(`presence:${roomId}:${userId}`);

        const presentUsers = await getPresentUsers(roomId);
        io.to(roomId).emit("presence:update", { roomId, users: presentUsers });
        socket.to(roomId).emit("presence:left", { roomId, userId });

        // Notify session-service to end tracking
        publishToQueue("session.ended", { userId, roomId }).catch(() => { });
    } catch (error) {
        console.error("presence:leave error:", error.message);
    }
};

export const getPresentUsers = async (roomId) => {
    // Scan all presence keys for this room
    const keys = await scanKeys(`presence:${roomId}:*`);
    if (!keys.length) return [];

    const users = await Promise.all(
        keys.map(async (key) => {
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        })
    );

    return users.filter(Boolean);
};

const scanKeys = async (pattern) => {
    return new Promise((resolve, reject) => {
        const keys = [];
        const stream = redis.scanStream({ match: pattern });
        stream.on("data", (batch) => keys.push(...batch));
        stream.on("end", () => resolve(keys));
        stream.on("error", reject);
    });
};