import http from "http";
import app from "./src/app.js";
import { initSocket } from "./src/socket/index.js";
import { connectRabbitMQ } from "./src/broker/rabbit.js";
import config from "./src/config/_config.js";

const startServer = async () => {
    await connectRabbitMQ();

    // http.createServer wraps Express — required for Socket.io
    const httpServer = http.createServer(app);

    // Attach Socket.io to the same HTTP server
    initSocket(httpServer);

    httpServer.listen(config.port, () => {
        console.log(`Realtime service running on port ${config.port}`);
    });
};

startServer();