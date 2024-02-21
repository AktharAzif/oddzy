import Redis from "ioredis";
import postgres from "postgres";

const { DATABASE_URL, REDIS_URL } = Bun.env;

if (!DATABASE_URL || !REDIS_URL) throw new Error("Environment variable DATABASE_URL and REDIS_URL must be set");

const sql = postgres(DATABASE_URL, {
	transform: postgres.camel
});

const redis = new Redis(REDIS_URL);

export { sql, redis };
