import amqp from "amqplib";
import config from "../config/_config.js";

/**
 * Realtime service consumers.
 * Handles events from other services that require immediate UI updates via Socket.io.
 */
export const startConsumers = async (io) => {
    try {
        const connection = await amqp.connect(config.rabbitmq_url);
        const channel = await connection.createChannel();

        // ── room.deleted ────────────────────────────────────────────────────────
        // Published by room-service when a room is permanently deleted or deactivated.
        await channel.assertQueue("room.deleted", { durable: true });
        channel.consume("room.deleted", async (msg) => {
            if (!msg) return;
            try {
                const { roomId } = JSON.parse(msg.content.toString());
                
                // Notify all users in the room and force them to leave
                io.to(roomId).emit("room:deleted", { 
                    roomId, 
                    message: "This room has been deleted by the administrator."
                });
                
                // We don't necessarily force disconnect sockets here, 
                // but the frontend should redirect them.
                
                console.log(`Event handled: room.deleted | roomId: ${roomId}`);
                channel.ack(msg);
            } catch (error) {
                console.error("room.deleted consumer error:", error.message);
                channel.nack(msg, false, false);
            }
        });

        // ── session.ended ──────────────────────────────────────────────────────
        // Can be used to sync UI states if needed, though mostly for backend tracking.
        await channel.assertQueue("realtime.session.ended", { durable: true });
        channel.consume("realtime.session.ended", async (msg) => {
            if (!msg) return;
            try {
                const { userId, roomId } = JSON.parse(msg.content.toString());
                // Could emit to specific user if needed
                // io.to(`user:${userId}`).emit("session:ended", { roomId });
                channel.ack(msg);
            } catch (error) {
                channel.nack(msg, false, false);
            }
        });

        console.log("Realtime service: RabbitMQ consumers started");
    } catch (error) {
        console.error("Realtime service: Consumer start failed:", error.message);
    }
};
