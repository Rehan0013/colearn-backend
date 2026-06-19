import express, { Request, Response } from "express";

const app = express();

app.use(express.json());

// health check with uptime
app.get("/health", (req: Request, res: Response) => {
    res.json({ message: "Notification service is running", uptime: process.uptime() });
});

export default app;
