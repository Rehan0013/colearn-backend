import amqp from "amqplib";
import config from "../config/_config.js";
import { startSession, endSession } from "../utils/session.util.js";

export const startConsumers = async () => {
    try {
        const connection = await amqp.connect(config.rabbitmq_url);
        const channel = await connection.createChannel();

        // ── session.started ────────────────────────────────────────────────────
        // Published by realtime-service on presence:join
        await channel.assertQueue("session.started", { durable: true });
        channel.consume("session.started", async (msg) => {
            if (!msg) return;
            try {
                const { userId, roomId, subject } = JSON.parse(msg.content.toString());
                await startSession({ userId, roomId, subject });
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

        console.log("Session service: consumers started");
    } catch (error) {
        console.error("Session service: consumer start failed:", error.message);
    }
};