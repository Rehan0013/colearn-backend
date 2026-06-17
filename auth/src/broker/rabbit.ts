import amqp from "amqplib";
import config from "../config/_config.js";
import userModel from "../models/user.model.js";
import logger from "../logger.js";

let channel: any;
let connection: any;

export async function connect(): Promise<void> {
    try {
        connection = await amqp.connect(config.rabbitmq_uri);
        
        // Handle connection errors
        connection.on("error", (err: Error) => {
            logger.error(err, "RabbitMQ connection error");
            if (err.message !== "Connection closing") {
                reconnect();
            }
        });

        connection.on("close", () => {
            logger.warn("RabbitMQ connection closed. Retrying...");
            reconnect();
        });

        channel = await connection.createChannel();
        
        channel.on("error", (err: Error) => {
            logger.error(err, "RabbitMQ channel error");
        });

        channel.on("close", () => {
            logger.warn("RabbitMQ channel closed.");
        });

        logger.info("Connected to RabbitMQ (Auth Service)");
        await setupConsumers();
    } catch (error: any) {
        logger.error(error, "Failed to connect to RabbitMQ");
        reconnect();
    }
}

function reconnect(): void {
    setTimeout(async () => {
        logger.info("Attempting to reconnect to RabbitMQ...");
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
                    logger.error(error instanceof Error ? error : { error }, `Error processing queue ${queueName}`);
                    // nack and don't requeue if it's a parsing error
                    channel?.nack(msg, false, false); 
                }
            }
        });
    } catch (err: any) {
        logger.error(err, "Setup consumers failed");
    }
}

export async function publishToQueue(queueName: string, data: any): Promise<void> {
    if (!channel) {
        logger.error(`Cannot publish to ${queueName}: No channel available`);
        return;
    }
    try {
        await channel.assertQueue(queueName, { durable: true });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), { persistent: true });
        logger.info(`Message sent to queue: ${queueName}`);
    } catch (err: any) {
        logger.error(err, `Error sending message to ${queueName}`);
    }
}
