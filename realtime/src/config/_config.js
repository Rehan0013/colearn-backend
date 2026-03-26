import dotenv from "dotenv";
dotenv.config();

export default {
    port: process.env.PORT || 5004,
    redis_url: process.env.REDIS_URI,
    rabbitmq_url: process.env.RABBITMQ_URI,
    jwt_secret: process.env.JWT_SECRET,
    client_url: process.env.CLIENT_URL,
    node_env: process.env.NODE_ENV || "development",
};