import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient } from "../db/redis.js";
import { socketAuthMiddleware } from "./middleware/auth.js";
import { registerPresenceHandlers } from "./handlers/presence.js";
import { registerPomodoroHandlers } from "./handlers/pomodoro.js";
import { registerChatHandlers } from "./handlers/chat.js";
import { registerNotesHandlers } from "./handlers/notes.js";
import config from "../config/_config.js";

export const initSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: config.client_url,
            credentials: true,
        },
        // Reconnection settings
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // ── Redis adapter (scales across multiple instances) ─────────────────────
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Realtime service: Socket.io Redis adapter attached");

    // ── Auth middleware (runs on every connection) ────────────────────────────
    io.use(socketAuthMiddleware);

    // ── Connection handler ────────────────────────────────────────────────────
    io.on("connection", (socket) => {
        console.log(`Socket connected: ${socket.id} | user: ${socket.user.id}`);

        // Register all feature handlers
        registerPresenceHandlers(io, socket);
        registerPomodoroHandlers(io, socket);
        registerChatHandlers(io, socket);
        registerNotesHandlers(io, socket);

        socket.on("disconnect", (reason) => {
            console.log(`Socket disconnected: ${socket.id} | reason: ${reason}`);
        });

        socket.on("error", (error) => {
            console.error(`Socket error: ${socket.id}`, error.message);
        });
    });

    return io;
};