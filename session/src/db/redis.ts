import { Redis } from "ioredis";
import config from "../config/_config.js";

const redisClient = new Redis(config.redis_url);

redisClient.on("connect", () => console.log("Session service: Redis connected"));
redisClient.on("error", (err: any) => console.error("Session service: Redis error:", err));

const redis = {
    get: (key: string): Promise<string | null> => redisClient.get(key),
    set: (key: string, value: string, ...args: any[]): Promise<any> => redisClient.set(key, value, ...args),
    del: (...keys: string[]): Promise<number> => redisClient.del(...keys),
    exists: (...keys: string[]): Promise<number> => redisClient.exists(...keys),
    incr: (key: string): Promise<number> => redisClient.incr(key),
    expire: (key: string, seconds: number): Promise<number> => redisClient.expire(key, seconds),
    ttl: (key: string): Promise<number> => redisClient.ttl(key),
    multi: () => redisClient.multi(),
    async delByPattern(pattern: string): Promise<void> {
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
