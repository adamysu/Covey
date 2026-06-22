import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const eggLogInputSchema = z.object({
  coopId: z.string().uuid().nullable().optional(),
  birdId: z.string().uuid().nullable().optional(),
  loggedOn: z.string().date(),
  quantity: z.number().int().min(0),
  notes: z.string().max(1000).nullable().optional()
});

const eggLogPatchSchema = eggLogInputSchema.partial();

const paramsSchema = z.object({
  id: z.string().uuid()
});

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change egg logs." });
    return null;
  }
  return user;
}

async function ensureOwned(table: "coops" | "birds", id: string, homesteadId: string) {
  const result = await db.query(`select id from ${table} where id = $1 and homestead_id = $2`, [
    id,
    homesteadId
  ]);
  return Boolean(result.rows[0]);
}

export async function eggRoutes(app: FastifyInstance) {
  app.get("/egg-logs", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select egg_logs.id,
              egg_logs.coop_id,
              coops.name as coop_name,
              egg_logs.bird_id,
              birds.name as bird_name,
              birds.band as bird_band,
              coalesce(birds.breeding_line_id, period_lines.id) as breeding_line_id,
              coalesce(bird_lines.name, period_lines.name) as breeding_line_name,
              periods.id as mating_period_id,
              periods.label as mating_period_label,
              egg_logs.logged_on,
              egg_logs.quantity,
              egg_logs.fertile_quantity,
              egg_logs.notes,
              egg_logs.created_at,
              egg_logs.updated_at
         from egg_logs
         left join coops on coops.id = egg_logs.coop_id
         left join birds on birds.id = egg_logs.bird_id
         left join breeding_lines bird_lines on bird_lines.id = birds.breeding_line_id
         left join lateral (
           select mating_periods.id,
                  mating_periods.label,
                  mating_periods.breeding_line_id
             from mating_periods
            where mating_periods.coop_id = egg_logs.coop_id
              and egg_logs.logged_on >= mating_periods.started_on
              and (mating_periods.ended_on is null or egg_logs.logged_on <= mating_periods.ended_on)
            order by mating_periods.started_on desc, mating_periods.created_at desc
            limit 1
         ) periods on true
         left join breeding_lines period_lines on period_lines.id = periods.breeding_line_id
        where egg_logs.homestead_id = $1
        order by egg_logs.logged_on desc, egg_logs.created_at desc`,
      [user.homestead_id]
    );

    return { eggLogs: result.rows };
  });

  app.post("/egg-logs", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = eggLogInputSchema.parse(request.body);

    if (input.coopId && !(await ensureOwned("coops", input.coopId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected coop was not found." });
    }
    if (input.birdId && !(await ensureOwned("birds", input.birdId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected bird was not found." });
    }
    const result = await db.query(
      `insert into egg_logs (homestead_id, coop_id, bird_id, logged_on, quantity, fertile_quantity, notes)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        user.homestead_id,
        input.coopId ?? null,
        input.birdId ?? null,
        input.loggedOn,
        input.quantity,
        null,
        input.notes ?? null
      ]
    );

    return reply.code(201).send({ eggLog: { id: result.rows[0].id } });
  });

  app.patch("/egg-logs/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = eggLogPatchSchema.parse(request.body);

    if (input.coopId && !(await ensureOwned("coops", input.coopId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected coop was not found." });
    }
    if (input.birdId && !(await ensureOwned("birds", input.birdId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected bird was not found." });
    }

    const current = await db.query("select id from egg_logs where id = $1 and homestead_id = $2", [
      params.id,
      user.homestead_id
    ]);
    if (!current.rows[0]) return reply.code(404).send({ message: "Egg log not found." });

    const result = await db.query(
      `update egg_logs
          set coop_id = case when $3 then $4 else coop_id end,
              bird_id = case when $5 then $6 else bird_id end,
              logged_on = coalesce($7, logged_on),
              quantity = coalesce($8, quantity),
              fertile_quantity = null,
              notes = case when $9 then $10 else notes end,
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id`,
      [
        params.id,
        user.homestead_id,
        Object.hasOwn(input, "coopId"),
        input.coopId ?? null,
        Object.hasOwn(input, "birdId"),
        input.birdId ?? null,
        input.loggedOn ?? null,
        input.quantity ?? null,
        Object.hasOwn(input, "notes"),
        input.notes ?? null
      ]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Egg log not found." });
    return { eggLog: { id: result.rows[0].id } };
  });

  app.delete("/egg-logs/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const result = await db.query("delete from egg_logs where id = $1 and homestead_id = $2 returning id", [
      params.id,
      user.homestead_id
    ]);

    if (!result.rows[0]) return reply.code(404).send({ message: "Egg log not found." });
    return { ok: true };
  });
}
