import amqp from "amqplib";
import config from "../config/_config.js";

let channel, connection;
let onConnectCallback = null;

export async function connect(onConnect) {
    if (onConnect) onConnectCallback = onConnect;
    
    try {
        connection = await amqp.connect(config.RABBITMQ_URI);

        connection.on("error", (err) => {
            console.error("Notification service: RabbitMQ connection error:", err.message);
            reconnect();
        });

        connection.on("close", () => {
            console.warn("Notification service: RabbitMQ connection closed. Retrying...");
            reconnect();
        });

        channel = await connection.createChannel();

        channel.on("error", (err) => {
            console.error("Notification service: RabbitMQ channel error:", err.message);
        });

        channel.on("close", () => {
            console.warn("Notification service: RabbitMQ channel closed.");
        });

        console.log("Notification service: Connected to RabbitMQ successfully");
        
        if (onConnectCallback) {
            await onConnectCallback();
        }
    } catch (error) {
        console.error("Notification service: RabbitMQ connection failed:", error.message);
        reconnect();
    }
}

function reconnect() {
    setTimeout(async () => {
        console.log("Notification service: Attempting to reconnect to RabbitMQ...");
        await connect();
    }, 5000); // 5 seconds delay
}

export async function publishToQueue(queueName, data) {
    if (!channel) {
        console.error(`Notification service: Cannot publish to ${queueName}: No channel available`);
        return;
    }
    try {
        await channel.assertQueue(queueName, { durable: true });
        channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), { persistent: true });
        console.log("Notification service: Message sent to queue: ", queueName);
    } catch (err) {
        console.error(`Notification service: Error sending message to ${queueName}:`, err.message);
    }
}

export async function subscribeToQueue(queueName, callback) {
    if (!channel) {
        console.error(`Notification service: Cannot subscribe to ${queueName}: No channel available`);
        return;
    }
    try {
        await channel.assertQueue(queueName, { durable: true });
        channel.consume(queueName, async (msg) => {
            if (msg !== null) {
                try {
                    await callback(JSON.parse(msg.content.toString()));
                    channel.ack(msg);
                } catch (error) {
                    console.error(`Notification service: Error processing message from ${queueName}:`, error);
                    // nack and don't requeue to avoid infinite loops on bad messages
                    channel.nack(msg, false, false);
                }
            }
        });
        console.log("Notification service: Registered listener for queue: ", queueName);
    } catch (err) {
        console.error(`Notification service: Failed to subscribe to ${queueName}:`, err.message);
    }
}
