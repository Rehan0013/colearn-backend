import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default("5005").transform((val) => parseInt(val, 10)),
    MONGO_URI: z.string().min(1, "MONGO_URI is required"),
    REDIS_URI: z.string().min(1, "REDIS_URI is required"),
    RABBITMQ_URI: z.string().min(1, "RABBITMQ_URI is required"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    CLIENT_URL: z.string().min(1, "CLIENT_URL is required"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error("❌ Invalid session service environment variables:", parsedEnv.error.format());
    process.exit(1);
}

const _config = {
    port: parsedEnv.data.PORT,
    mongo_uri: parsedEnv.data.MONGO_URI,
    redis_url: parsedEnv.data.REDIS_URI,
    rabbitmq_url: parsedEnv.data.RABBITMQ_URI,
    jwt_secret: parsedEnv.data.JWT_SECRET,
    client_url: parsedEnv.data.CLIENT_URL,
    node_env: parsedEnv.data.NODE_ENV,
};

export default Object.freeze(_config);
