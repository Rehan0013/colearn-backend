import { z } from "zod";
import mongoose from "mongoose";
import { getChannel } from "./rabbit.js";
import { startSession, endSession } from "../utils/session.util.js";

const sessionStartedSchema = z.object({
    userId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid user ID",
    }),
    roomId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid room ID",
    }),
    subject: z.string().optional(),
    userEmail: z.string().email(),
    userFullName: z.object({
        firstName: z.string(),
        lastName: z.string(),
    }),
});

const sessionEndedSchema = z.object({
    userId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid user ID",
    }),
    roomId: z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
        message: "Invalid room ID",
    }),
});

export const startConsumers = async (): Promise<void> => {
    const channel = getChannel();
    if (!channel) {
        console.error("Session service: Cannot start consumers, no RabbitMQ channel available");
        return;
    }

    try {
        // ── session.started ────────────────────────────────────────────────────
        // Published by realtime-service on presence:join
        await channel.assertQueue("session.started", { durable: true });
        channel.consume("session.started", async (msg: any) => {
            if (!msg) return;
            try {
                const rawData = JSON.parse(msg.content.toString());
                const parsed = sessionStartedSchema.parse(rawData);
                const { userId, roomId, subject, userEmail, userFullName } = parsed;
                
                await startSession({ userId, roomId, subject, userEmail, userFullName });
                console.log(`Session started — user: ${userId}, room: ${roomId}`);
                channel.ack(msg);
            } catch (error: any) {
                console.error("session.started consumer error:", error.message);
                channel.nack(msg, false, false);
            }
        });

        // ── session.ended ──────────────────────────────────────────────────────
        // Published by realtime-service on disconnect OR manual end
        await channel.assertQueue("session.ended", { durable: true });
        channel.consume("session.ended", async (msg: any) => {
            if (!msg) return;
            try {
                const rawData = JSON.parse(msg.content.toString());
                const parsed = sessionEndedSchema.parse(rawData);
                const { userId, roomId } = parsed;

                await endSession({ userId, roomId });
                console.log(`Session ended — user: ${userId}, room: ${roomId}`);
                channel.ack(msg);
            } catch (error: any) {
                console.error("session.ended consumer error:", error.message);
                channel.nack(msg, false, false);
            }
        });

        console.log("Session service: consumers registered successfully");
    } catch (error: any) {
        console.error("Session service: consumer registration failed:", error.message);
    }
};
