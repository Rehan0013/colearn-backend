import Redis from "ioredis";
import config from "../config/_config.js";

const redis = new Redis(config.redis_url);

redis.on("connect", () => console.log("Notes service: Redis connected"));
redis.on("error", (err) => console.error("Notes service: Redis error:", err));

export default redis;