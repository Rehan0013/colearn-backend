import { config as dotenvConfig } from "dotenv";
dotenvConfig();

const _config = {
    port: process.env.PORT || 5002,
    CLIENT_URL: process.env.CLIENT_URL,
    MONGO_URI: process.env.MONGO_URI,
    REDIS_URI: process.env.REDIS_URI,
    RABBITMQ_URI: process.env.RABBITMQ_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
}

export default Object.freeze(_config);