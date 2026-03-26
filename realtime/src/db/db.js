import mongoose from "mongoose";
import config from "../config/_config.js";

const connectDB = async () => {
    try {
        await mongoose.connect(config.mongo_uri);
        console.log("Realtime service: MongoDB connected");
    } catch (error) {
        console.error("Realtime service: MongoDB connection error:", error);
        process.exit(1);
    }
};

export default connectDB;
