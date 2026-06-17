import { Redis } from "ioredis";
import config from "../config/_config.js";
import logger from "../logger.js";

const redis = new Redis(config.redis_uri);

redis.on("connect", () => {
    logger.info("Connected to Redis");
});

redis.on("error", (err: any) => {
    logger.error(err, "Redis connection error:");
});

export default redis;
