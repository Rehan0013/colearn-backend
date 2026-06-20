import mongoose from "mongoose";
import config from "../config/_config.js";

export const connectDB = async (): Promise<void> => {
    try {
        await mongoose.connect(config.mongo_uri);
        console.log("Session service: MongoDB connected");
    } catch (error: any) {
        console.error("Session service: MongoDB connection failed:", error.message);
        process.exit(1);
    }
};
