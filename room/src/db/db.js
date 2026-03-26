import mongoose from "mongoose";
import config from "../config/_config.js";

export const connectDB = async () => {
    try {
        await mongoose.connect(config.MONGO_URI);
        console.log("Room service: MongoDB connected");
    } catch (error) {
        console.error("Room service: MongoDB connection failed:", error.message);
        process.exit(1);
    }
};