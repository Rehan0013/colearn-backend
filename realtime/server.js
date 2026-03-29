import http from "http";
import app from "./src/app.js";
import { initSocket } from "./src/socket/index.js";
import { startConsumers } from "./src/broker/consumers.js";
import { connectRabbitMQ } from "./src/broker/rabbit.js";
import config from "./src/config/_config.js";
import connectDB from "./src/db/db.js";

const startServer = async () => {
    await connectDB();
    await connectRabbitMQ();

    // http.createServer wraps Express — required for Socket.io
    const httpServer = http.createServer(app);

    // Attach Socket.io to the same HTTP server
    const io = initSocket(httpServer);
    await startConsumers(io);

    httpServer.listen(config.port, () => {
        console.log(`Realtime service running on port ${config.port}`);
    });
};

startServer();