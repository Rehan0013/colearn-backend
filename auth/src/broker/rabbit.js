import amqp from "amqplib";
import config from "../config/_config.js";
import userModel from "../models/user.model.js";

let channel, connection;

export async function connect() {
    try {
        connection = await amqp.connect(config.rabbitmq_uri);
        
        // Handle connection errors
        connection.on("error", (err) => {
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
        
        channel.on("error", (err) => {
            console.error("RabbitMQ channel error:", err.message);
        });

        channel.on("close", () => {
            console.warn("RabbitMQ channel closed.");
        });

        console.log("Connected to RabbitMQ (Auth Service)");
        await setupConsumers();
    } catch (error) {
        console.error("Failed to connect to RabbitMQ:", error.message);
        reconnect();
    }
}

async function reconnect() {
    setTimeout(async () => {
        console.log("Attempting to reconnect to RabbitMQ...");
        await connect();
    }, 5000); // 5 seconds delay
}

async function setupConsumers() {
    const queueName = "user.stats.updated";
    try {
        await channel.assertQueue(queueName, { durable: true });
        
        channel.consume(queueName, async (msg) => {
            if (msg !== null) {
                try {
                    const data = JSON.parse(msg.content.toString());
                    const { userId, streak, totalStudyMinutes } = data;

                    await userModel.findByIdAndUpdate(userId, {
                        streak,
                        totalStudyMinutes,
                        lastStreakDate: new Date()
                    });

                    channel.ack(msg);
                } catch (error) {
                    console.error(`Error processing queue ${queueName}:`, error);
                    // nack and don't requeue if it's a parsing error
                    channel.nack(msg, false, false); 
                }
            }
        });
    } catch (err) {
        console.error("Setup consumers failed:", err.message);
    }
}

export async function publishToQueue(queueName, data) {
    if (!channel) {
        console.error(`Cannot publish to ${queueName}: No channel available`);
        return;
    }
    try {
        await channel.assertQueue(queueName, { durable: true });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), { persistent: true });
        console.log("Message sent to queue: ", queueName);
    } catch (err) {
        console.error(`Error sending message to ${queueName}:`, err.message);
    }
}
