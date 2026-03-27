import dotenv from "dotenv";
dotenv.config();

export default {
    port: process.env.PORT || 5003,
    redis_url: process.env.REDIS_URI,
    rabbitmq_url: process.env.RABBITMQ_URI,
    jwt_secret: process.env.JWT_SECRET,
    client_url: process.env.CLIENT_URL,
    node_env: process.env.NODE_ENV || "development",
    mongo_uri: process.env.MONGO_URI,
    imagekit_public_key: process.env.IMAGEKIT_PUBLIC_KEY,
    imagekit_private_key: process.env.IMAGEKIT_PRIVATE_KEY,
    imagekit_url_endpoint: process.env.IMAGEKIT_URL_ENDPOINT,
};