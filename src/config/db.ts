import postgres from "postgres";
import Redis from "ioredis";

const { DATABASE_URL, REDIS_URL } = Bun.env;

if (!DATABASE_URL || !REDIS_URL) throw new Error("Environment variable DATABASE_URL and REDIS_URL must be set");

const sql = postgres(DATABASE_URL);

const redis = new Redis(REDIS_URL);

export { sql, redis };
