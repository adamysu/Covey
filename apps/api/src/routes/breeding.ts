import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const paramsSchema = z.object({
  id: z.string().uuid()
});

const breedingLineInputSchema = z.object({
  name: z.string().min(1).max(160),
  goal: z.string().max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  active: z.boolean().optional()
});

const breedingLinePatchSchema = breedingLineInputSchema.partial();
const henIdsSchema = z.array(z.string().uuid());

const matingPeriodInputSchema = z.object({
  breedingLineId: z.string().uuid(),
  coopId: z.string().uuid().nullable().optional(),
  sireId: z.string().uuid().nullable().optional(),
  henIds: henIdsSchema.default([]),
  label: z.string().min(1).max(160),
  startedOn: z.string().date(),
  endedOn: z.string().date().nullable().optional(),
  notes: z.string().max(1000).nullable().optional()
});

const matingPeriodPatchSchema = z.object({
  breedingLineId: z.string().uuid().optional(),
  coopId: z.string().uuid().nullable().optional(),
  sireId: z.string().uuid().nullable().optional(),
  henIds: henIdsSchema.optional(),
  label: z.string().min(1).max(160).optional(),
  startedOn: z.string().date().optional(),
  endedOn: z.string().date().nullable().optional(),
  notes: z.string().max(1000).nullable().optional()
});

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change breeding records." });
    return null;
  }
  return user;
}

async function ensureOwned(table: "breeding_lines" | "coops" | "birds", id: string | null | undefined, homesteadId: string) {
  if (!id) return true;
  const result = await db.query(`select id from ${table} where id = $1 and homestead_id = $2`, [
    id,
    homesteadId
  ]);
  return Boolean(result.rows[0]);
}

async function replaceHens(matingPeriodId: string, henIds: string[], joinedOn: string) {
  await db.query("delete from mating_period_hens where mating_period_id = $1", [matingPeriodId]);
  for (const henId of henIds) {
    await db.query(
      `insert into mating_period_hens (mating_period_id, hen_id, joined_on)
       values ($1, $2, $3)`,
      [matingPeriodId, henId, joinedOn]
    );
  }
}

function uniqueNameMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "23505") {
    return "A breeding line with that name already exists.";
  }
  return null;
}

export async function breedingRoutes(app: FastifyInstance) {
  app.get("/breeding-lines", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select lines.id,
              lines.name,
              lines.goal,
              lines.notes,
              lines.active,
              lines.created_at,
              lines.updated_at,
              count(distinct periods.id)::int as mating_period_count,
              count(distinct periods.id) filter (where periods.ended_on is null)::int as active_period_count,
              coalesce(sum(incubations.eggs_set), 0)::int as eggs_set,
              coalesce(sum(incubations.fertile_eggs), 0)::int as fertile_eggs,
              coalesce(sum(incubations.hatched_count), 0)::int as hatched_count
         from breeding_lines lines
         left join mating_periods periods on periods.breeding_line_id = lines.id
         left join incubations on incubations.mating_period_id = periods.id
        where lines.homestead_id = $1
        group by lines.id
        order by lines.active desc, lines.name asc`,
      [user.homestead_id]
    );

    return { breedingLines: result.rows };
  });

  app.post("/breeding-lines", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = breedingLineInputSchema.parse(request.body);

    try {
      const result = await db.query(
        `insert into breeding_lines (homestead_id, name, goal, notes, active)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [user.homestead_id, input.name, input.goal || null, input.notes || null, input.active ?? true]
      );

      return reply.code(201).send({ breedingLine: { id: result.rows[0].id } });
    } catch (error: unknown) {
      const message = uniqueNameMessage(error);
      if (message) return reply.code(409).send({ message });
      throw error;
    }
  });

  app.patch("/breeding-lines/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = breedingLinePatchSchema.parse(request.body);

    try {
      const result = await db.query(
        `update breeding_lines
            set name = coalesce($3, name),
                goal = case when $4 then $5 else goal end,
                notes = case when $6 then $7 else notes end,
                active = coalesce($8, active),
                updated_at = now()
          where id = $1
            and homestead_id = $2
          returning id`,
        [
          params.id,
          user.homestead_id,
          input.name ?? null,
          Object.hasOwn(input, "goal"),
          input.goal || null,
          Object.hasOwn(input, "notes"),
          input.notes || null,
          input.active ?? null
        ]
      );

      if (!result.rows[0]) return reply.code(404).send({ message: "Breeding line not found." });
      return { breedingLine: { id: result.rows[0].id } };
    } catch (error: unknown) {
      const message = uniqueNameMessage(error);
      if (message) return reply.code(409).send({ message });
      throw error;
    }
  });

  app.delete("/breeding-lines/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const result = await db.query(
      `delete from breeding_lines
        where id = $1
          and homestead_id = $2
        returning id`,
      [params.id, user.homestead_id]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Breeding line not found." });
    return { ok: true };
  });

  app.get("/mating-periods", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select periods.id,
              periods.breeding_line_id,
              lines.name as breeding_line_name,
              periods.coop_id,
              coops.name as coop_name,
              periods.sire_id,
              coalesce(sire.band, sire.name, 'Unbanded sire') as sire_label,
              periods.label,
              periods.started_on,
              periods.ended_on,
              periods.notes,
              periods.created_at,
              periods.updated_at,
              coalesce(hens.hen_count, 0)::int as hen_count,
              coalesce(hens.hens, '[]'::json) as hens,
              coalesce(stats.incubation_count, 0)::int as incubation_count,
              coalesce(stats.eggs_set, 0)::int as eggs_set,
              coalesce(stats.fertile_eggs, 0)::int as fertile_eggs,
              coalesce(stats.hatched_count, 0)::int as hatched_count
         from mating_periods periods
         join breeding_lines lines on lines.id = periods.breeding_line_id
         left join coops on coops.id = periods.coop_id
         left join birds sire on sire.id = periods.sire_id
         left join lateral (
           select count(*) as hen_count,
                  json_agg(
                    json_build_object(
                      'id', birds.id,
                      'label', coalesce(birds.band, birds.name, 'Unbanded hen'),
                      'joined_on', period_hens.joined_on,
                      'left_on', period_hens.left_on
                    )
                    order by coalesce(birds.band, birds.name, birds.id::text)
                  ) as hens
             from mating_period_hens period_hens
             join birds on birds.id = period_hens.hen_id
            where period_hens.mating_period_id = periods.id
         ) hens on true
         left join lateral (
           select count(*) as incubation_count,
                  coalesce(sum(eggs_set), 0) as eggs_set,
                  coalesce(sum(fertile_eggs), 0) as fertile_eggs,
                  coalesce(sum(hatched_count), 0) as hatched_count
             from incubations
            where incubations.mating_period_id = periods.id
         ) stats on true
        where periods.homestead_id = $1
        order by periods.started_on desc, periods.created_at desc`,
      [user.homestead_id]
    );

    return { matingPeriods: result.rows };
  });

  app.post("/mating-periods", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = matingPeriodInputSchema.parse(request.body);

    if (!(await ensureOwned("breeding_lines", input.breedingLineId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected breeding line was not found." });
    }
    if (!(await ensureOwned("coops", input.coopId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected coop was not found." });
    }
    if (!(await ensureOwned("birds", input.sireId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected sire was not found." });
    }
    for (const henId of input.henIds) {
      if (!(await ensureOwned("birds", henId, user.homestead_id))) {
        return reply.code(400).send({ message: "One selected hen was not found." });
      }
    }

    const result = await db.query(
      `insert into mating_periods (
         homestead_id, breeding_line_id, coop_id, sire_id, label, started_on, ended_on, notes
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        user.homestead_id,
        input.breedingLineId,
        input.coopId ?? null,
        input.sireId ?? null,
        input.label,
        input.startedOn,
        input.endedOn ?? null,
        input.notes || null
      ]
    );

    await replaceHens(result.rows[0].id, input.henIds, input.startedOn);
    return reply.code(201).send({ matingPeriod: { id: result.rows[0].id } });
  });

  app.patch("/mating-periods/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = matingPeriodPatchSchema.parse(request.body);

    const current = await db.query(
      "select id, started_on from mating_periods where id = $1 and homestead_id = $2",
      [params.id, user.homestead_id]
    );
    if (!current.rows[0]) return reply.code(404).send({ message: "Mating period not found." });

    if (input.breedingLineId && !(await ensureOwned("breeding_lines", input.breedingLineId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected breeding line was not found." });
    }
    if (Object.hasOwn(input, "coopId") && !(await ensureOwned("coops", input.coopId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected coop was not found." });
    }
    if (Object.hasOwn(input, "sireId") && !(await ensureOwned("birds", input.sireId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected sire was not found." });
    }
    if (Object.hasOwn(input, "henIds")) {
      for (const henId of input.henIds ?? []) {
        if (!(await ensureOwned("birds", henId, user.homestead_id))) {
          return reply.code(400).send({ message: "One selected hen was not found." });
        }
      }
    }

    const result = await db.query(
      `update mating_periods
          set breeding_line_id = coalesce($3, breeding_line_id),
              coop_id = case when $4 then $5 else coop_id end,
              sire_id = case when $6 then $7 else sire_id end,
              label = coalesce($8, label),
              started_on = coalesce($9, started_on),
              ended_on = case when $10 then $11 else ended_on end,
              notes = case when $12 then $13 else notes end,
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id, started_on`,
      [
        params.id,
        user.homestead_id,
        input.breedingLineId ?? null,
        Object.hasOwn(input, "coopId"),
        input.coopId ?? null,
        Object.hasOwn(input, "sireId"),
        input.sireId ?? null,
        input.label ?? null,
        input.startedOn ?? null,
        Object.hasOwn(input, "endedOn"),
        input.endedOn ?? null,
        Object.hasOwn(input, "notes"),
        input.notes || null
      ]
    );

    if (Object.hasOwn(input, "henIds")) {
      await replaceHens(result.rows[0].id, input.henIds ?? [], input.startedOn ?? result.rows[0].started_on);
    }

    return { matingPeriod: { id: result.rows[0].id } };
  });

  app.delete("/mating-periods/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const result = await db.query(
      `delete from mating_periods
        where id = $1
          and homestead_id = $2
        returning id`,
      [params.id, user.homestead_id]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Mating period not found." });
    return { ok: true };
  });
}
