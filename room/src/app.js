import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import roomRoutes from "./routes/room.route.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import config from "./config/_config.js";

const app = express();

app.use(cors({ origin: config.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/api/rooms", roomRoutes);

// 404
app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use(errorHandler);

export default app;