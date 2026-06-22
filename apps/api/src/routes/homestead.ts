import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  profile: z.record(z.unknown()).optional(),
  preferences: z.record(z.unknown()).optional()
});

export async function homesteadRoutes(app: FastifyInstance) {
  app.get("/homestead", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select homesteads.id,
              homesteads.name,
              homesteads.profile,
              homestead_settings.preferences
         from homesteads
         join homestead_settings on homestead_settings.homestead_id = homesteads.id
        where homesteads.id = $1`,
      [user.homestead_id]
    );

    return { homestead: result.rows[0] };
  });

  app.patch("/homestead", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    if (user.role !== "OWNER") return reply.code(403).send({ message: "Only owners can edit homestead settings." });

    const input = updateSchema.parse(request.body);
    const client = await db.connect();

    try {
      await client.query("begin");
      if (input.name || input.profile) {
        await client.query(
          `update homesteads
              set name = coalesce($2, name),
                  profile = coalesce($3::jsonb, profile),
                  updated_at = now()
            where id = $1`,
          [user.homestead_id, input.name ?? null, input.profile ? JSON.stringify(input.profile) : null]
        );
      }

      if (input.preferences) {
        await client.query(
          `update homestead_settings
              set preferences = preferences || $2::jsonb,
                  updated_at = now()
            where homestead_id = $1`,
          [user.homestead_id, JSON.stringify(input.preferences)]
        );
      }

      await client.query("commit");
      return { ok: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}
