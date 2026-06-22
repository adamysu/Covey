import type { FastifyInstance } from "fastify";
import { db } from "../db.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    await db.query("select 1");
    return { ok: true };
  });
}
