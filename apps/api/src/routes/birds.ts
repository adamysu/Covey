import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const sexSchema = z.enum(["MALE", "FEMALE", "UNKNOWN"]);
const statusSchema = z.enum(["ACTIVE", "PROCESSED", "SOLD", "DIED", "RETIRED", "CULLED"]);

const birdInputSchema = z.object({
  name: z.string().max(120).nullable().optional(),
  band: z.string().max(120).nullable().optional(),
  birdType: z.string().max(120).nullable().optional(),
  sex: sexSchema,
  status: statusSchema.default("ACTIVE"),
  coopId: z.string().uuid().nullable().optional(),
  hatchDate: z.string().date().nullable().optional(),
  processedDate: z.string().date().nullable().optional(),
  currentWeightOz: z.number().positive().nullable().optional(),
  notes: z.string().max(1000).nullable().optional()
});

const birdPatchSchema = birdInputSchema.partial();

const paramsSchema = z.object({
  id: z.string().uuid()
});

const weightLogInputSchema = z.object({
  birdId: z.string().uuid(),
  weighedOn: z.string().date(),
  weightOz: z.number().positive(),
  notes: z.string().max(1000).nullable().optional()
});

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change bird records." });
    return null;
  }
  return user;
}

async function normalizeCoopId(homesteadId: string, coopId?: string | null) {
  if (!coopId) return null;

  const result = await db.query("select id from coops where id = $1 and homestead_id = $2", [
    coopId,
    homesteadId
  ]);

  if (!result.rows[0]) return false;

  return coopId;
}

async function ensureBirdOwned(homesteadId: string, birdId: string) {
  const result = await db.query("select id from birds where id = $1 and homestead_id = $2", [birdId, homesteadId]);
  return Boolean(result.rows[0]);
}

async function refreshCurrentWeight(homesteadId: string, birdId: string) {
  await db.query(
    `update birds
        set current_weight_oz = (
              select weight_oz
                from weight_logs
               where weight_logs.bird_id = birds.id
               order by weighed_on desc, created_at desc
               limit 1
            ),
            updated_at = now()
      where birds.id = $1
        and birds.homestead_id = $2`,
    [birdId, homesteadId]
  );
}

function uniqueBandMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "23505") {
    return "That band is already assigned to an active bird.";
  }
  return null;
}

function isForeignKeyError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23503");
}

function isIntegrityError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("23")
  );
}

async function archiveBird(homesteadId: string, birdId: string, status: "RETIRED" | "PROCESSED") {
  return db.query(
    `update birds
        set status = case when status = 'ACTIVE' then $3 else status end,
            band = null,
            coop_id = null,
            updated_at = now()
      where id = $1
        and homestead_id = $2
      returning id`,
    [birdId, homesteadId, status]
  );
}

export async function birdRoutes(app: FastifyInstance) {
  app.get("/weight-logs", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select id,
              bird_id,
              weighed_on,
              weight_oz,
              notes,
              created_at
         from weight_logs
        where homestead_id = $1
        order by weighed_on desc, created_at desc`,
      [user.homestead_id]
    );

    return { weightLogs: result.rows };
  });

  app.post("/weight-logs", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = weightLogInputSchema.parse(request.body);

    if (!(await ensureBirdOwned(user.homestead_id, input.birdId))) {
      return reply.code(400).send({ message: "Selected bird was not found." });
    }

    const result = await db.query(
      `insert into weight_logs (homestead_id, bird_id, weighed_on, weight_oz, notes)
       values ($1, $2, $3, $4, $5)
       on conflict (bird_id, weighed_on)
       do update set weight_oz = excluded.weight_oz,
                     notes = excluded.notes,
                     created_at = now()
       returning id`,
      [user.homestead_id, input.birdId, input.weighedOn, input.weightOz, input.notes ?? null]
    );

    await refreshCurrentWeight(user.homestead_id, input.birdId);
    return reply.code(201).send({ weightLog: { id: result.rows[0].id } });
  });

  app.delete("/weight-logs/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const result = await db.query(
      `delete from weight_logs
        where id = $1
          and homestead_id = $2
        returning bird_id`,
      [params.id, user.homestead_id]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Weight log not found." });
    await refreshCurrentWeight(user.homestead_id, result.rows[0].bird_id);
    return { ok: true };
  });

  app.get("/birds", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select birds.id,
              birds.name,
              birds.band,
              birds.bird_type,
              birds.sex,
              birds.status,
              birds.hatch_batch_id,
              hatch_batches.label as hatch_batch_label,
              birds.breeding_line_id,
              breeding_lines.name as breeding_line_name,
              birds.coop_id,
              coops.name as coop_name,
              birds.hatch_date,
              birds.processed_date,
              birds.current_weight_oz,
              birds.notes,
              birds.created_at,
              birds.updated_at
         from birds
         left join hatch_batches on hatch_batches.id = birds.hatch_batch_id
         left join breeding_lines on breeding_lines.id = birds.breeding_line_id
         left join coops on coops.id = birds.coop_id
        where birds.homestead_id = $1
        order by birds.status asc, coalesce(birds.band, birds.name, birds.id::text) asc`,
      [user.homestead_id]
    );

    return { birds: result.rows };
  });

  app.post("/birds", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = birdInputSchema.parse(request.body);
    const coopId = await normalizeCoopId(user.homestead_id, input.coopId);
    if (coopId === false) return reply.code(400).send({ message: "Selected coop was not found." });

    try {
      const result = await db.query(
        `insert into birds (
           homestead_id, name, band, sex, status, coop_id, hatch_date, processed_date,
           current_weight_oz, notes, bird_type
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning id`,
        [
          user.homestead_id,
          input.name || null,
          input.band || null,
          input.sex,
          input.status,
          coopId,
          input.hatchDate ?? null,
          input.processedDate ?? null,
          input.currentWeightOz ?? null,
          input.notes || null,
          input.birdType || null
        ]
      );

      return reply.code(201).send({ bird: { id: result.rows[0].id } });
    } catch (error: unknown) {
      const message = uniqueBandMessage(error);
      if (message) return reply.code(409).send({ message });
      throw error;
    }
  });

  app.patch("/birds/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = birdPatchSchema.parse(request.body);
    const coopId = Object.hasOwn(input, "coopId")
      ? await normalizeCoopId(user.homestead_id, input.coopId)
      : null;
    if (coopId === false) return reply.code(400).send({ message: "Selected coop was not found." });

    try {
      const result = await db.query(
        `update birds
            set name = case when $3 then $4 else name end,
                band = case when $5 then $6 else band end,
                sex = coalesce($7, sex),
                status = coalesce($8, status),
                coop_id = case when $9 then $10 else coop_id end,
                hatch_date = case when $11 then $12 else hatch_date end,
                processed_date = case when $13 then $14 else processed_date end,
                current_weight_oz = case when $15 then $16 else current_weight_oz end,
                notes = case when $17 then $18 else notes end,
                bird_type = case when $19 then $20 else bird_type end,
                updated_at = now()
          where id = $1
            and homestead_id = $2
          returning id`,
        [
          params.id,
          user.homestead_id,
          Object.hasOwn(input, "name"),
          input.name || null,
          Object.hasOwn(input, "band"),
          input.band || null,
          input.sex ?? null,
          input.status ?? null,
          Object.hasOwn(input, "coopId"),
          coopId,
          Object.hasOwn(input, "hatchDate"),
          input.hatchDate ?? null,
          Object.hasOwn(input, "processedDate"),
          input.processedDate ?? null,
          Object.hasOwn(input, "currentWeightOz"),
          input.currentWeightOz ?? null,
          Object.hasOwn(input, "notes"),
          input.notes || null,
          Object.hasOwn(input, "birdType"),
          input.birdType || null
        ]
      );

      if (!result.rows[0]) return reply.code(404).send({ message: "Bird not found." });
      return { bird: { id: result.rows[0].id } };
    } catch (error: unknown) {
      const message = uniqueBandMessage(error);
      if (message) return reply.code(409).send({ message });
      throw error;
    }
  });

  app.delete("/birds/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    try {
      const result = await db.query(
        `delete from birds
          where id = $1
            and homestead_id = $2
          returning id`,
        [params.id, user.homestead_id]
      );

      if (!result.rows[0]) return reply.code(404).send({ message: "Bird not found." });
      return { ok: true, archived: false };
    } catch (error: unknown) {
      if (!isForeignKeyError(error) && !isIntegrityError(error)) throw error;

      const result = await archiveBird(user.homestead_id, params.id, "RETIRED").catch(async (archiveError: unknown) => {
        if (!isIntegrityError(archiveError)) throw archiveError;
        return archiveBird(user.homestead_id, params.id, "PROCESSED");
      });

      if (!result.rows[0]) return reply.code(404).send({ message: "Bird not found." });
      return { ok: true, archived: true };
    }
  });
}
