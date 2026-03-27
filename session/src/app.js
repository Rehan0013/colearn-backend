import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import sessionRoutes from "./routes/session.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import config from "./config/_config.js";

const app = express();

app.use(cors({ origin: config.client_url, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/sessions", sessionRoutes);

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", service: "session-service" });
});

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use(errorHandler);

export default app;