import Redis from "ioredis";
import config from "../config/_config.js";

// Primary client — general usage (get/set/del)
export const redis = new Redis(config.redis_url);

// Two separate clients required by @socket.io/redis-adapter
export const pubClient = new Redis(config.redis_url);
export const subClient = new Redis(config.redis_url);

redis.on("connect", () => console.log("Realtime service: Redis connected"));
redis.on("error", (err) => console.error("Realtime service: Redis error:", err));

export default redis;