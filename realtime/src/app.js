import express from "express";
import cors from "cors";
import config from "./config/_config.js";

import chatRoutes from "./routes/chat.route.js";

const app = express();

app.use(cors({ origin: config.client_url, credentials: true }));
app.use(express.json());

// Routes
app.use("/api/chat", chatRoutes);

// Health check — useful for Docker and load balancers
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", service: "realtime-service" });
});

// 404
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

export default app;