import amqp from "amqplib";
import config from "../config/_config.js";
import { saveNoteVersion } from "../utils/notes.util.js";

export const startConsumers = async () => {
    try {
        const connection = await amqp.connect(config.rabbitmq_url);
        const channel = await connection.createChannel();

        // ── notes.save ─────────────────────────────────────────────────────────
        // Published by realtime-service after 2s debounce on note changes
        await channel.assertQueue("notes.save", { durable: true });
        channel.consume("notes.save", async (msg) => {
            if (!msg) return;
            try {
                const { roomId, content, lastEditedBy, updatedAt } = JSON.parse(
                    msg.content.toString()
                );

                await saveNoteVersion({ roomId, content, lastEditedBy, updatedAt });
                console.log(`Note saved for room: ${roomId}`);
                channel.ack(msg);
            } catch (error) {
                console.error("notes.save consumer error:", error.message);
                channel.nack(msg, false, false); // discard bad message
            }
        });

        console.log("Notes service: consumers started");
    } catch (error) {
        console.error("Notes service: consumer start failed:", error.message);
    }
};