import mongoose from "mongoose";
import config from "../config/_config.js";

export const connectDB = async () => {
    try {
        await mongoose.connect(config.mongo_uri);
        console.log("Notes service: MongoDB connected");
    } catch (error) {
        console.error("Notes service: MongoDB connection failed:", error.message);
        process.exit(1);
    }
};