import amqp from "amqplib";
import UserCache from "../models/userCache.model.js";
import config from "../config/_config.js";

/**
 * room-service consumes "user_created" from auth-service
 * and stores a lightweight user reference locally.
 * This avoids calling auth-service on every room request.
 */
export const startConsumers = async () => {
    try {
        const connection = await amqp.connect(config.RABBITMQ_URI);
        const channel = await connection.createChannel();

        // ── user_created ───────────────────────────────────────────────────────
        await channel.assertQueue("user_created", { durable: true });
        channel.consume("user_created", async (msg) => {
            if (!msg) return;
            try {
                const { id, email, fullName } = JSON.parse(msg.content.toString());

                // Upsert — safe to run multiple times
                await UserCache.findOneAndUpdate(
                    { _id: id },
                    { _id: id, email, fullName },
                    { upsert: true, new: true }
                );

                console.log(`UserCache saved for: ${email}`);
                channel.ack(msg);
            } catch (error) {
                console.error("user_created consumer error:", error.message);
                channel.nack(msg, false, false); // discard bad message
            }
        });

        console.log("Room service: consumers started");
    } catch (error) {
        console.error("Room service: consumer start failed:", error.message);
    }
};