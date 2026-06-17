import mongoose from "mongoose";
import config from "../config/_config.js";
import logger from "../logger.js";

const connectDB = async (): Promise<void> => {
    try {
        await mongoose.connect(config.mongo_uri);
        logger.info("MongoDB connected");
    } catch (error) {
        logger.error(error instanceof Error ? error : { error }, "MongoDB connection error:");
        process.exit(1);
    }
};

export default connectDB;
