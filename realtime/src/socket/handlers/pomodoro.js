import redis from "../../db/redis.js";
import Room from "../../models/room.model.js";

const POMODORO_TTL = 60 * 60; // 1 hour

/**
 * Redis key: pomodoro:{roomId} → JSON state of the timer
 *
 * Timer states: "idle" | "focus" | "short_break" | "long_break"
 *
 * Events:
 *   pomodoro:start    → admin starts the timer
 *   pomodoro:pause    → admin pauses
 *   pomodoro:reset    → admin resets
 *   pomodoro:tick     → server broadcasts every second
 *   pomodoro:done     → server broadcasts when timer hits 0
 *   pomodoro:state    → sent to a user who joins mid-session
 */

const DURATIONS = {
    focus: 25 * 60,        // 25 minutes
    short_break: 5 * 60,   // 5 minutes
    long_break: 15 * 60,   // 15 minutes
};

// In-memory interval store — one interval per room
const roomIntervals = new Map();

export const registerPomodoroHandlers = (io, socket) => {
    const userId = socket.user.id;

    // ── Get current state (for users joining mid-session) ────────────────────
    socket.on("pomodoro:get", async ({ roomId }) => {
        try {
            const state = await getPomodoroState(roomId);
            socket.emit("pomodoro:state", state);
        } catch (error) {
            console.error("pomodoro:get error:", error.message);
        }
    });

    // ── Start timer ──────────────────────────────────────────────────────────
    socket.on("pomodoro:start", async ({ roomId, mode = "focus" }) => {
        try {
            console.log(`[pomodoro:start] Request from ${userId} for room ${roomId}`);

            // Check if user is admin (owner or role:admin)
            const room = await Room.findById(roomId).lean();
            if (!room) {
                console.log(`[pomodoro:start] Room ${roomId} not found`);
                return;
            }

            const isOwner = String(room.createdBy?._id || room.createdBy) === String(userId);
            const isAdmin = room.members?.some(m => {
                const mUserId = m.user?._id || m.user;
                return String(mUserId) === String(userId) && m.role === "admin";
            });

            console.log(`[pomodoro:start] Auth check: isOwner=${isOwner}, isAdmin=${isAdmin}`);

            if (!isOwner && !isAdmin) {
                console.log(`[pomodoro:start] Access denied for ${userId}`);
                socket.emit("error", { message: "Only administrators can start the timer" });
                return;
            }

            const existing = await getPomodoroState(roomId);
            if (existing?.isRunning) {
                console.log(`[pomodoro:start] Timer already running for room ${roomId}`);
                return;
            }

            const duration = DURATIONS[mode] ?? DURATIONS.focus;
            const state = {
                roomId,
                mode,
                duration,
                remaining: (existing?.remaining && existing.remaining > 0) ? existing.remaining : duration,
                isRunning: true,
                startedBy: userId,
                startedAt: Date.now(),
            };

            console.log(`[pomodoro:start] Setting state:`, state);
            await setPomodoroState(roomId, state);
            io.to(roomId).emit("pomodoro:state", state);

            startTicking(io, roomId);
        } catch (error) {
            console.error("pomodoro:start error:", error.message);
        }
    });

    // ── Pause timer ──────────────────────────────────────────────────────────
    socket.on("pomodoro:pause", async ({ roomId }) => {
        try {
            const room = await Room.findById(roomId).lean();
            if (!room) return;

            const isOwner = String(room.createdBy?._id || room.createdBy) === String(userId);
            const isAdmin = room.members?.some(m => {
                const mUserId = m.user?._id || m.user;
                return String(mUserId) === String(userId) && m.role === "admin";
            });

            if (!isOwner && !isAdmin) {
                socket.emit("error", { message: "Only administrators can control the timer" });
                return;
            }

            const state = await getPomodoroState(roomId);
            if (!state?.isRunning) return;

            console.log(`[pomodoro:pause] Pausing room ${roomId}`);
            stopTicking(roomId);

            state.isRunning = false;
            await setPomodoroState(roomId, state);
            io.to(roomId).emit("pomodoro:state", state);
        } catch (error) {
            console.error("pomodoro:pause error:", error.message);
        }
    });

    // ── Reset timer ──────────────────────────────────────────────────────────
    socket.on("pomodoro:reset", async ({ roomId, mode = "focus" }) => {
        try {
            const room = await Room.findById(roomId).lean();
            if (!room) return;

            const isOwner = String(room.createdBy?._id || room.createdBy) === String(userId);
            const isAdmin = room.members?.some(m => {
                const mUserId = m.user?._id || m.user;
                return String(mUserId) === String(userId) && m.role === "admin";
            });

            if (!isOwner && !isAdmin) {
                socket.emit("error", { message: "Only administrators can control the timer" });
                return;
            }

            console.log(`[pomodoro:reset] Resetting room ${roomId} to mode ${mode}`);
            stopTicking(roomId);

            const state = {
                roomId,
                mode,
                duration: DURATIONS[mode],
                remaining: DURATIONS[mode],
                isRunning: false,
                startedBy: null,
                startedAt: null,
            };

            await setPomodoroState(roomId, state);
            io.to(roomId).emit("pomodoro:state", state);
        } catch (error) {
            console.error("pomodoro:reset error:", error.message);
        }
    });
};

// ── Ticker ────────────────────────────────────────────────────────────────────

const startTicking = (io, roomId) => {
    // Clear any existing interval to prevent duplicates or "stuck" timers
    stopTicking(roomId);

    const interval = setInterval(async () => {
        try {
            const state = await getPomodoroState(roomId);
            if (!state || !state.isRunning) {
                stopTicking(roomId);
                return;
            }

            state.remaining -= 1;

            if (state.remaining <= 0) {
                state.remaining = 0;
                state.isRunning = false;
                stopTicking(roomId);
                await setPomodoroState(roomId, state);
                io.to(roomId).emit("pomodoro:done", { roomId, mode: state.mode });
                return;
            }

            await setPomodoroState(roomId, state);
            io.to(roomId).emit("pomodoro:tick", {
                roomId,
                remaining: state.remaining,
            });
        } catch (error) {
            console.error("pomodoro tick error:", error.message);
            stopTicking(roomId);
        }
    }, 1000);

    roomIntervals.set(roomId, interval);
};

const stopTicking = (roomId) => {
    const interval = roomIntervals.get(roomId);
    if (interval) {
        clearInterval(interval);
        roomIntervals.delete(roomId);
    }
};

// ── Redis helpers ─────────────────────────────────────────────────────────────

const getPomodoroState = async (roomId) => {
    const data = await redis.get(`pomodoro:${roomId}`);
    return data ? JSON.parse(data) : null;
};

const setPomodoroState = async (roomId, state) => {
    await redis.set(`pomodoro:${roomId}`, JSON.stringify(state), "EX", POMODORO_TTL);
};