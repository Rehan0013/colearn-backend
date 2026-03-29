import Redis from "ioredis";
import config from "../config/_config.js";

let redis;

export const connectRedis = async () => {
    redis = new Redis(config.REDIS_URI);
    redis.on("connect", () => console.log("Room service: Redis connected"));
    redis.on("error", (err) => console.error("Room service: Redis error:", err));
};

export default {
    get: (...args) => redis.get(...args),
    set: (...args) => redis.set(...args),
    del: (...args) => redis.del(...args),
    exists: (...args) => redis.exists(...args),
    async delByPattern(pattern) {
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = nextCursor;
            if (keys && keys.length > 0) {
                await redis.del(...keys);
            }
        } while (cursor !== "0");
    }
};