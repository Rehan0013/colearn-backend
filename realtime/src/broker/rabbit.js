import amqp from "amqplib";
import config from "../config/_config.js";

let channel, connection;
let onConnectCallback = null;

export const connectRabbitMQ = async (onConnect) => {
    if (onConnect && typeof onConnect === "function") {
        onConnectCallback = onConnect;
    }

    try {
        connection = await amqp.connect(config.rabbitmq_url);

        connection.on("error", (err) => {
            console.error("Realtime service: RabbitMQ connection error:", err.message);
            reconnect();
        });

        connection.on("close", () => {
            console.warn("Realtime service: RabbitMQ connection closed. Retrying...");
            reconnect();
        });

        channel = await connection.createChannel();

        channel.on("error", (err) => {
            console.error("Realtime service: RabbitMQ channel error:", err.message);
        });

        channel.on("close", () => {
            console.warn("Realtime service: RabbitMQ channel closed.");
        });

        console.log("Realtime service: RabbitMQ connected successfully");
        
        if (onConnectCallback) {
            await onConnectCallback();
        }
    } catch (error) {
        console.error("Realtime service: RabbitMQ connection failed:", error.message);
        reconnect();
    }
};

const reconnect = () => {
    setTimeout(async () => {
        console.log("Realtime service: Attempting to reconnect to RabbitMQ...");
        await connectRabbitMQ();
    }, 5000); // 5 seconds delay
};

export const publishToQueue = async (queue, data) => {
    if (!channel) {
        console.error(`Realtime service: Cannot publish to ${queue}: No channel available`);
        return;
    }
    try {
        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), { persistent: true });
        console.log("Realtime service: Message sent to queue: ", queue);
    } catch (error) {
        console.error(`Realtime service: RabbitMQ publish to [${queue}] failed:`, error.message);
    }
};

export const getChannel = () => channel;