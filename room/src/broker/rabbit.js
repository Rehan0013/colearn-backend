import amqp from "amqplib";
import config from "../config/_config.js";

let channel, connection;

export const connectRabbitMQ = async () => {
    try {
        connection = await amqp.connect(config.RABBITMQ_URI);
        
        connection.on("error", (err) => {
            console.error("Room service: RabbitMQ connection error:", err.message);
            reconnect();
        });

        connection.on("close", () => {
            console.warn("Room service: RabbitMQ connection closed. Retrying...");
            reconnect();
        });

        channel = await connection.createChannel();
        
        channel.on("error", (err) => {
            console.error("Room service: RabbitMQ channel error:", err.message);
        });

        channel.on("close", () => {
            console.warn("Room service: RabbitMQ channel closed.");
        });

        console.log("Room service: RabbitMQ connected successfully");
    } catch (error) {
        console.error("Room service: RabbitMQ connection failed:", error.message);
        reconnect();
    }
};

const reconnect = () => {
    setTimeout(async () => {
        console.log("Room service: Attempting to reconnect to RabbitMQ...");
        await connectRabbitMQ();
    }, 5000); // 5 seconds delay
};

export const publishToQueue = async (queue, data) => {
    if (!channel) {
        console.error(`Room service: Cannot publish to ${queue}: No channel available`);
        return;
    }
    try {
        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), { persistent: true });
        console.log("Room service: Message sent to queue: ", queue);
    } catch (error) {
        console.error(`Room service: RabbitMQ publish to [${queue}] failed:`, error.message);
    }
};