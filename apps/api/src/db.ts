import pg from "pg";
import { env } from "./config/env.js";

export const db = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10
});

export async function closeDb() {
  await db.end();
}
