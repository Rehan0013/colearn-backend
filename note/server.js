import app from "./src/app.js";
import { connectDB } from "./src/db/db.js";
import { connectRabbitMQ } from "./src/broker/rabbit.js";
import { startConsumers } from "./src/broker/consumers.js";
import config from "./src/config/_config.js";

const startServer = async () => {
    await connectDB();
    await connectRabbitMQ(startConsumers);

    app.listen(config.port, () => {
        console.log(`Notes service running on port ${config.port}`);
    });
};

startServer();