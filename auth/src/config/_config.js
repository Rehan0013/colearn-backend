import { config as dotenvConfig } from "dotenv";
dotenvConfig();

const config = {
    port: process.env.PORT || 5001,
    mongo_uri: process.env.MONGO_URI,
    redis_uri: process.env.REDIS_URI,
    jwt_secret: process.env.JWT_SECRET,
    rabbitmq_uri: process.env.RABBITMQ_URI,
    imagekit_public_key: process.env.IMAGEKIT_PUBLIC_KEY,
    imagekit_private_key: process.env.IMAGEKIT_PRIVATE_KEY,
    imagekit_url_endpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    google_client_id: process.env.CLIENT_ID,
    google_client_secret: process.env.CLIENT_SECRET,
    jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
    client_url: process.env.CLIENT_URL,
    node_env: process.env.NODE_ENV,
};

export default config;
