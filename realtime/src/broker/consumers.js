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

        // ── room.member.kicked ──────────────────────────────────────────────────
        // Published by room-service when a member is kicked and banned.
        await channel.assertQueue("room.member.kicked", { durable: true });
        channel.consume("room.member.kicked", async (msg) => {
            if (!msg) return;
            try {
                const { roomId, memberId } = JSON.parse(msg.content.toString());

                // 1. Notify the kicked user specifically
                io.to(roomId).emit("room:kicked", {
                    roomId,
                    userId: memberId,
                    message: "You have been kicked and banned from this room."
                });

                // 2. Update presence list for others
                // The frontend should handle the 'room:kicked' event and clear cache
                console.log(`Event handled: room.member.kicked | roomId: ${roomId} | memberId: ${memberId}`);
                channel.ack(msg);
            } catch (error) {
                console.error("room.member.kicked consumer error:", error.message);
                channel.nack(msg, false, false);
            }
        });

        console.log("Realtime service: RabbitMQ consumers started");
    } catch (error) {
        console.error("Realtime service: Consumer start failed:", error.message);
    }
};
