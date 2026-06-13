import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const envSchema = z.object({
    PORT: z.string().default("5001").transform((val) => parseInt(val, 10)),
    MONGO_URI: z.string().min(1, "MONGO_URI is required"),
    REDIS_URI: z.string().min(1, "REDIS_URI is required"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    RABBITMQ_URI: z.string().min(1, "RABBITMQ_URI is required"),
    IMAGEKIT_PUBLIC_KEY: z.string().min(1, "IMAGEKIT_PUBLIC_KEY is required"),
    IMAGEKIT_PRIVATE_KEY: z.string().min(1, "IMAGEKIT_PRIVATE_KEY is required"),
    IMAGEKIT_URL_ENDPOINT: z.string().min(1, "IMAGEKIT_URL_ENDPOINT is required"),
    CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
    CLIENT_SECRET: z.string().min(1, "CLIENT_SECRET is required"),
    JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
    CLIENT_URL: z.string().min(1, "CLIENT_URL is required"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error("❌ Invalid environment variables:", parsedEnv.error.format());
    process.exit(1);
}

const env = parsedEnv.data;

const config = {
    port: env.PORT,
    mongo_uri: env.MONGO_URI,
    redis_uri: env.REDIS_URI,
    jwt_secret: env.JWT_SECRET,
    rabbitmq_uri: env.RABBITMQ_URI,
    imagekit_public_key: env.IMAGEKIT_PUBLIC_KEY,
    imagekit_private_key: env.IMAGEKIT_PRIVATE_KEY,
    imagekit_url_endpoint: env.IMAGEKIT_URL_ENDPOINT,
    google_client_id: env.CLIENT_ID,
    google_client_secret: env.CLIENT_SECRET,
    jwt_refresh_secret: env.JWT_REFRESH_SECRET,
    client_url: env.CLIENT_URL,
    node_env: env.NODE_ENV,
} as const;

export default config;
