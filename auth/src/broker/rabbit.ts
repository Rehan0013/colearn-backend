import amqp from "amqplib";
import config from "../config/_config.js";
import userModel from "../models/user.model.js";

let channel: any;
let connection: any;

export async function connect(): Promise<void> {
    try {
        connection = await amqp.connect(config.rabbitmq_uri);
        
        // Handle connection errors
        connection.on("error", (err: Error) => {
            console.error("RabbitMQ connection error:", err.message);
            if (err.message !== "Connection closing") {
                reconnect();
            }
        });

        connection.on("close", () => {
            console.warn("RabbitMQ connection closed. Retrying...");
            reconnect();
        });

        channel = await connection.createChannel();
        
        channel.on("error", (err: Error) => {
            console.error("RabbitMQ channel error:", err.message);
        });

        channel.on("close", () => {
            console.warn("RabbitMQ channel closed.");
        });

        console.log("Connected to RabbitMQ (Auth Service)");
        await setupConsumers();
    } catch (error: any) {
        console.error("Failed to connect to RabbitMQ:", error.message);
        reconnect();
    }
}

function reconnect(): void {
    setTimeout(async () => {
        console.log("Attempting to reconnect to RabbitMQ...");
        await connect();
    }, 5000); // 5 seconds delay
}

async function setupConsumers(): Promise<void> {
    if (!channel) return;
    const queueName = "user.stats.updated";
    try {
        await channel.assertQueue(queueName, { durable: true });
        
        channel.consume(queueName, async (msg: amqp.ConsumeMessage | null) => {
            if (msg !== null) {
                try {
                    const data = JSON.parse(msg.content.toString());
                    const { userId, streak, totalStudyMinutes } = data;

                    await userModel.findByIdAndUpdate(userId, {
                        streak,
                        totalStudyMinutes,
                        lastStreakDate: new Date()
                    });

                    channel?.ack(msg);
                } catch (error) {
                    console.error(`Error processing queue ${queueName}:`, error);
                    // nack and don't requeue if it's a parsing error
                    channel?.nack(msg, false, false); 
                }
            }
        });
    } catch (err: any) {
        console.error("Setup consumers failed:", err.message);
    }
}

export async function publishToQueue(queueName: string, data: any): Promise<void> {
    if (!channel) {
        console.error(`Cannot publish to ${queueName}: No channel available`);
        return;
    }
    try {
        await channel.assertQueue(queueName, { durable: true });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), { persistent: true });
        console.log("Message sent to queue: ", queueName);
    } catch (err: any) {
        console.error(`Error sending message to ${queueName}:`, err.message);
    }
}
