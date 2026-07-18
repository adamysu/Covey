import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const entitySchema = z.discriminatedUnion("entityType", [
  z.object({ entityType: z.literal("BIRD"), entityId: z.string().uuid() }),
  z.object({ entityType: z.literal("COOP"), entityId: z.string().uuid() }),
  z.object({ entityType: z.literal("MATING_PERIOD"), entityId: z.string().uuid() })
]);

const eventFieldsSchema = z.object({
  happenedOn: z.string().date(),
  category: z.enum(["NOTE", "MOVEMENT", "BEHAVIOR", "BREEDING", "PROCESSING", "LOSS", "OTHER"]),
  title: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(2000).nullable().optional()
});

const createSchema = entitySchema.and(eventFieldsSchema);
const patchSchema = eventFieldsSchema.partial();
const paramsSchema = z.object({ id: z.string().uuid() });
const querySchema = z.object({
  entityType: z.enum(["BIRD", "COOP", "MATING_PERIOD"]),
  entityId: z.string().uuid()
});

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change history entries." });
    return null;
  }
  return user;
}

function entityColumn(entityType: "BIRD" | "COOP" | "MATING_PERIOD") {
  if (entityType === "BIRD") return { table: "birds", column: "bird_id" };
  if (entityType === "COOP") return { table: "coops", column: "coop_id" };
  return { table: "mating_periods", column: "mating_period_id" };
}

async function entityExists(entityType: "BIRD" | "COOP" | "MATING_PERIOD", entityId: string, homesteadId: string) {
  const { table } = entityColumn(entityType);
  const result = await db.query(`select id from ${table} where id = $1 and homestead_id = $2`, [
    entityId,
    homesteadId
  ]);
  return Boolean(result.rows[0]);
}

export async function recordEventRoutes(app: FastifyInstance) {
  app.get("/record-events", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const query = querySchema.parse(request.query);
    const { column } = entityColumn(query.entityType);

    const result = await db.query(
      `select record_events.id,
              record_events.bird_id,
              record_events.coop_id,
              record_events.mating_period_id,
              record_events.happened_on,
              record_events.category,
              record_events.title,
              record_events.notes,
              record_events.created_at,
              record_events.updated_at,
              users.display_name as created_by_name
         from record_events
         left join users on users.id = record_events.created_by
        where record_events.homestead_id = $1
          and record_events.${column} = $2
        order by record_events.happened_on desc, record_events.created_at desc`,
      [user.homestead_id, query.entityId]
    );

    return { recordEvents: result.rows };
  });

  app.post("/record-events", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = createSchema.parse(request.body);
    if (!(await entityExists(input.entityType, input.entityId, user.homestead_id))) {
      return reply.code(404).send({ message: "The selected record was not found." });
    }

    const ids = {
      birdId: input.entityType === "BIRD" ? input.entityId : null,
      coopId: input.entityType === "COOP" ? input.entityId : null,
      matingPeriodId: input.entityType === "MATING_PERIOD" ? input.entityId : null
    };
    const result = await db.query(
      `insert into record_events (
         homestead_id, bird_id, coop_id, mating_period_id, happened_on, category, title, notes, created_by
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       returning id`,
      [
        user.homestead_id,
        ids.birdId,
        ids.coopId,
        ids.matingPeriodId,
        input.happenedOn,
        input.category,
        input.title,
        input.notes || null,
        user.id
      ]
    );
    return reply.code(201).send({ recordEvent: { id: result.rows[0].id } });
  });

  app.patch("/record-events/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = patchSchema.parse(request.body);
    const result = await db.query(
      `update record_events
          set happened_on = coalesce($3, happened_on),
              category = coalesce($4, category),
              title = coalesce($5, title),
              notes = case when $6 then $7 else notes end,
              updated_at = now()
        where id = $1 and homestead_id = $2
        returning id`,
      [
        params.id,
        user.homestead_id,
        input.happenedOn ?? null,
        input.category ?? null,
        input.title ?? null,
        Object.hasOwn(input, "notes"),
        input.notes || null
      ]
    );
    if (!result.rows[0]) return reply.code(404).send({ message: "History entry not found." });
    return { recordEvent: { id: result.rows[0].id } };
  });

  app.delete("/record-events/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const result = await db.query(
      "delete from record_events where id = $1 and homestead_id = $2 returning id",
      [params.id, user.homestead_id]
    );
    if (!result.rows[0]) return reply.code(404).send({ message: "History entry not found." });
    return { ok: true };
  });
}
