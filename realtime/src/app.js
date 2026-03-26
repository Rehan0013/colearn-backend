import express from "express";
import cors from "cors";
import config from "./config/_config.js";

const app = express();

app.use(cors({ origin: config.client_url, credentials: true }));
app.use(express.json());

// Health check — useful for Docker and load balancers
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", service: "realtime-service" });
});

// 404
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

export default app;