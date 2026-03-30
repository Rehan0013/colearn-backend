import { getChannel } from "./rabbit.js";
import { startSession, endSession } from "../utils/session.util.js";

export const startConsumers = async () => {
    const channel = getChannel();
    if (!channel) {
        console.error("Session service: Cannot start consumers, no RabbitMQ channel available");
        return;
    }

    try {
        // ── session.started ────────────────────────────────────────────────────
        // Published by realtime-service on presence:join
        await channel.assertQueue("session.started", { durable: true });
        channel.consume("session.started", async (msg) => {
            if (!msg) return;
            try {
                const { userId, roomId, subject, userEmail, userFullName } = JSON.parse(msg.content.toString());
                await startSession({ userId, roomId, subject, userEmail, userFullName });
                console.log(`Session started — user: ${userId}, room: ${roomId}`);
                channel.ack(msg);
            } catch (error) {
                console.error("session.started consumer error:", error.message);
                channel.nack(msg, false, false);
            }
        });

        // ── session.ended ──────────────────────────────────────────────────────
        // Published by realtime-service on disconnect OR manual end
        await channel.assertQueue("session.ended", { durable: true });
        channel.consume("session.ended", async (msg) => {
            if (!msg) return;
            try {
                const { userId, roomId } = JSON.parse(msg.content.toString());
                await endSession({ userId, roomId });
                console.log(`Session ended — user: ${userId}, room: ${roomId}`);
                channel.ack(msg);
            } catch (error) {
                console.error("session.ended consumer error:", error.message);
                channel.nack(msg, false, false);
            }
        });

        console.log("Session service: consumers registered successfully");
    } catch (error) {
        console.error("Session service: consumer registration failed:", error.message);
    }
};