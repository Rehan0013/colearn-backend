import { getChannel } from "./rabbit.js";
import { saveNoteVersion } from "../utils/notes.util.js";

export const startConsumers = async () => {
    const channel = getChannel();
    if (!channel) {
        console.error("Notes service: Cannot start consumers, no RabbitMQ channel available");
        return;
    }

    try {
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

        console.log("Notes service: consumers registered successfully");
    } catch (error) {
        console.error("Notes service: consumer registration failed:", error.message);
    }
};