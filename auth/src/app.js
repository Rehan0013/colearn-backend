import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";

import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import authRoutes from "./routes/auth.route.js";

import config from "./config/_config.js";

const app = express();

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
}, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
}));

// health check with up time
app.get("/health", (req, res) => {
    res.json({ message: "Auth service is running", uptime: process.uptime() });
});

app.use("/api/auth", authRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "Internal Server Error", error: err.message });
});


export default app;