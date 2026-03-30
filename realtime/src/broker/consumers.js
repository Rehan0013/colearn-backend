import { getChannel } from "./rabbit.js";
import redis from "../db/redis.js";
import { getPresentUsers } from "../socket/handlers/presence.js";

/**
 * Realtime service consumers.
 * Handles events from other services that require immediate UI updates via Socket.io.
 */
let ioRef = null;

export const startConsumers = async (io) => {
    if (io) ioRef = io;
    if (!ioRef) return;

    const channel = getChannel();
    if (!channel) {
        console.error("Realtime service: Cannot start consumers, no RabbitMQ channel available");
        return;
    }

    try {
        // ── room.deleted ────────────────────────────────────────────────────────
        // Published by room-service when a room is permanently deleted or deactivated.
        await channel.assertQueue("room.deleted", { durable: true });
        channel.consume("room.deleted", async (msg) => {
            if (!msg) return;
            try {
                const { roomId } = JSON.parse(msg.content.toString());
                
                // Notify all users in the room and force them to leave
                ioRef.to(roomId).emit("room:deleted", { 
                    roomId, 
                    message: "This room has been deleted by the administrator."
                });
                
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
                ioRef.to(roomId).emit("room:kicked", {
                    roomId,
                    userId: memberId,
                    message: "You have been kicked and banned from this room."
                });

                // 2. Immediate Presence Cleanup in Redis
                await redis.del(`presence:${roomId}:${memberId}`);

                // 3. Broadcast updated presence list to everyone remaining
                const updatedUsers = await getPresentUsers(roomId);
                ioRef.to(roomId).emit("presence:update", { roomId, users: updatedUsers });

                console.log(`Event handled: room.member.kicked | Presence cleaned for: ${memberId}`);
                channel.ack(msg);
            } catch (error) {
                console.error("room.member.kicked consumer error:", error.message);
                channel.nack(msg, false, false);
            }
        });

        // ── room.member.promoted ────────────────────────────────────────────────
        // Published by room-service when a new admin is promoted (e.g. previous admin left).
        await channel.assertQueue("room.member.promoted", { durable: true });
        channel.consume("room.member.promoted", async (msg) => {
            if (!msg) return;
            try {
                const { roomId, newAdminId } = JSON.parse(msg.content.toString());
                
                // Notify the room to re-fetch members/admin status
                ioRef.to(roomId).emit("room:member:promoted", { roomId, newAdminId });
                
                console.log(`Event handled: room.member.promoted | roomId: ${roomId} | newAdminId: ${newAdminId}`);
                channel.ack(msg);
            } catch (error) {
                console.error("room.member.promoted consumer error:", error.message);
                channel.nack(msg, false, false);
            }
        });

        console.log("Realtime service: RabbitMQ consumers registered successfully");
    } catch (error) {
        console.error("Realtime service: Consumer registration failed:", error.message);
    }
};
