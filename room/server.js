import app from "./src/app.js";
import { connectDB } from "./src/db/db.js";
import { connectRedis } from "./src/db/redis.js";
import { connectRabbitMQ } from "./src/broker/rabbit.js";
import { startConsumers } from "./src/broker/consumers.js";
import config from "./src/config/_config.js";

const PORT = config.port;

const startServer = async () => {
    await connectDB();
    await connectRedis();
    await connectRabbitMQ();
    await startConsumers();

    app.listen(PORT, () => {
        console.log(`Room service running on port ${PORT}`);
    });
};

startServer();