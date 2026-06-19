import { config as dotenvConfig } from "dotenv";
import { z } from "zod";

dotenvConfig();

const envSchema = z.object({
    PORT: z.string().default("5006").transform((val) => parseInt(val, 10)),
    CLIENT_ID: z.string().min(1, "CLIENT_ID is required"),
    CLIENT_SECRET: z.string().min(1, "CLIENT_SECRET is required"),
    REFRESH_TOKEN: z.string().min(1, "REFRESH_TOKEN is required"),
    EMAIL_USER: z.string().email("EMAIL_USER must be a valid email"),
    RABBITMQ_URI: z.string().min(1, "RABBITMQ_URI is required"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error("❌ Invalid notification service environment variables:", parsedEnv.error.format());
    process.exit(1);
}

const _config = {
    port: parsedEnv.data.PORT,
    CLIENT_ID: parsedEnv.data.CLIENT_ID,
    CLIENT_SECRET: parsedEnv.data.CLIENT_SECRET,
    REFRESH_TOKEN: parsedEnv.data.REFRESH_TOKEN,
    EMAIL_USER: parsedEnv.data.EMAIL_USER,
    RABBITMQ_URI: parsedEnv.data.RABBITMQ_URI,
};

export default Object.freeze(_config);
