import Redis from "ioredis";
import config from "../config/_config.js";

const redisClient = new Redis(config.redis_url);

redisClient.on("connect", () => console.log("Session service: Redis connected"));
redisClient.on("error", (err) => console.error("Session service: Redis error:", err));

const redis = {
    get: (...args) => redisClient.get(...args),
    set: (...args) => redisClient.set(...args),
    del: (...args) => redisClient.del(...args),
    exists: (...args) => redisClient.exists(...args),
    async delByPattern(pattern) {
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redisClient.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = nextCursor;
            if (keys && keys.length > 0) {
                await redisClient.del(...keys);
            }
        } while (cursor !== "0");
    }
};

export default redis;