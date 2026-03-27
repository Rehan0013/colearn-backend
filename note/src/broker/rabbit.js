import amqp from "amqplib";
import config from "../config/_config.js";

let channel;

export const connectRabbitMQ = async () => {
    try {
        const connection = await amqp.connect(config.rabbitmq_url);
        channel = await connection.createChannel();
        console.log("Notes service: RabbitMQ connected");
    } catch (error) {
        console.error("Notes service: RabbitMQ connection failed:", error.message);
        process.exit(1);
    }
};

export const publishToQueue = async (queue, data) => {
    try {
        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)));
    } catch (error) {
        console.error(`RabbitMQ publish to [${queue}] failed:`, error.message);
    }
};

export { channel };