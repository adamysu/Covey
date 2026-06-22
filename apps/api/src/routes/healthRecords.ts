import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const healthEventInputSchema = z.object({
  birdId: z.string().uuid().nullable().optional(),
  coopId: z.string().uuid().nullable().optional(),
  observedOn: z.string().date(),
  eventType: z.enum(["HEALTH", "INJURY", "TREATMENT", "QUARANTINE", "BEHAVIOR", "MORTALITY", "OTHER"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  outcome: z.enum(["OPEN", "MONITORING", "RESOLVED", "CULLED", "DIED"]).default("OPEN"),
  title: z.string().min(1).max(160),
  notes: z.string().max(1000).nullable().optional(),
  treatment: z.string().max(1000).nullable().optional(),
  followUpOn: z.string().date().nullable().optional()
});

const healthEventPatchSchema = healthEventInputSchema.partial();
const paramsSchema = z.object({ id: z.string().uuid() });

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change health records." });
    return null;
  }
  return user;
}

async function ensureOwned(table: "birds" | "coops", id: string | null | undefined, homesteadId: string) {
  if (!id) return true;
  const result = await db.query(`select id from ${table} where id = $1 and homestead_id = $2`, [
    id,
    homesteadId
  ]);
  return Boolean(result.rows[0]);
}

export async function healthRecordRoutes(app: FastifyInstance) {
  app.get("/health-events", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select bird_health_events.id,
              bird_health_events.bird_id,
              birds.name as bird_name,
              birds.band as bird_band,
              bird_health_events.coop_id,
              coops.name as coop_name,
              bird_health_events.observed_on,
              bird_health_events.event_type,
              bird_health_events.severity,
              bird_health_events.outcome,
              bird_health_events.title,
              bird_health_events.notes,
              bird_health_events.treatment,
              bird_health_events.follow_up_on,
              bird_health_events.created_at,
              bird_health_events.updated_at
         from bird_health_events
         left join birds on birds.id = bird_health_events.bird_id
         left join coops on coops.id = bird_health_events.coop_id
        where bird_health_events.homestead_id = $1
        order by bird_health_events.observed_on desc, bird_health_events.created_at desc`,
      [user.homestead_id]
    );

    return { healthEvents: result.rows };
  });

  app.post("/health-events", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = healthEventInputSchema.parse(request.body);

    if (!(await ensureOwned("birds", input.birdId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected bird was not found." });
    }
    if (!(await ensureOwned("coops", input.coopId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected coop was not found." });
    }

    const result = await db.query(
      `insert into bird_health_events (
         homestead_id, bird_id, coop_id, observed_on, event_type, severity, outcome,
         title, notes, treatment, follow_up_on
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning id`,
      [
        user.homestead_id,
        input.birdId ?? null,
        input.coopId ?? null,
        input.observedOn,
        input.eventType,
        input.severity,
        input.outcome,
        input.title,
        input.notes ?? null,
        input.treatment ?? null,
        input.followUpOn ?? null
      ]
    );

    return reply.code(201).send({ healthEvent: { id: result.rows[0].id } });
  });

  app.patch("/health-events/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = healthEventPatchSchema.parse(request.body);

    if (!(await ensureOwned("birds", input.birdId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected bird was not found." });
    }
    if (!(await ensureOwned("coops", input.coopId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected coop was not found." });
    }

    const result = await db.query(
      `update bird_health_events
          set bird_id = case when $3 then $4 else bird_id end,
              coop_id = case when $5 then $6 else coop_id end,
              observed_on = coalesce($7, observed_on),
              event_type = coalesce($8, event_type),
              severity = coalesce($9, severity),
              outcome = coalesce($10, outcome),
              title = coalesce($11, title),
              notes = case when $12 then $13 else notes end,
              treatment = case when $14 then $15 else treatment end,
              follow_up_on = case when $16 then $17 else follow_up_on end,
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id`,
      [
        params.id,
        user.homestead_id,
        Object.hasOwn(input, "birdId"),
        input.birdId ?? null,
        Object.hasOwn(input, "coopId"),
        input.coopId ?? null,
        input.observedOn ?? null,
        input.eventType ?? null,
        input.severity ?? null,
        input.outcome ?? null,
        input.title ?? null,
        Object.hasOwn(input, "notes"),
        input.notes ?? null,
        Object.hasOwn(input, "treatment"),
        input.treatment ?? null,
        Object.hasOwn(input, "followUpOn"),
        input.followUpOn ?? null
      ]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Health record not found." });
    return { healthEvent: { id: result.rows[0].id } };
  });

  app.delete("/health-events/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const result = await db.query(
      "delete from bird_health_events where id = $1 and homestead_id = $2 returning id",
      [params.id, user.homestead_id]
    );
    if (!result.rows[0]) return reply.code(404).send({ message: "Health record not found." });
    return { ok: true };
  });
}
