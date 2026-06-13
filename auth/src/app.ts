import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";

import passport from "passport";
import { Strategy as GoogleStrategy, VerifyCallback } from "passport-google-oauth20";

import { rateLimiter } from "./middlewares/rateLimiter.middleware.js";
import authRoutes from "./routes/auth.route.js";

import config from "./config/_config.js";

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(morgan("dev"));
app.use(cors(
    {
        origin: config.client_url,
        credentials: true
    }
));
app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

// Configure Passport to use Google OAuth 2.0 strategy
passport.use(new GoogleStrategy({
    clientID: config.google_client_id,
    clientSecret: config.google_client_secret,
    callbackURL: '/api/auth/google/callback',
}, (accessToken: string, refreshToken: string, profile: passport.Profile, done: VerifyCallback) => {
    return done(null, profile as any);
}));

// health check with up time
app.get("/health", (req: Request, res: Response) => {
    res.json({ message: "Auth service is running", uptime: process.uptime() });
});

app.use("/api/auth", rateLimiter({ windowSeconds: 900, maxRequests: 100, keyPrefix: "auth" }), authRoutes);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
});

export default app;
