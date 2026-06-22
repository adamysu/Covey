import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const incubationInputSchema = z.object({
  matingPeriodId: z.string().uuid().nullable().optional(),
  label: z.string().min(1).max(160),
  setDate: z.string().date(),
  eggsSet: z.number().int().min(0),
  fertileEggs: z.number().int().min(0).nullable().optional(),
  hatchedCount: z.number().int().min(0).nullable().optional(),
  candleDate: z.string().date().nullable().optional(),
  lockdownDate: z.string().date().nullable().optional(),
  expectedHatchDate: z.string().date().nullable().optional(),
  parameters: z.record(z.unknown()).default({}),
  notes: z.string().max(1000).nullable().optional()
});

const incubationPatchSchema = incubationInputSchema.partial();

const paramsSchema = z.object({
  id: z.string().uuid()
});

const hatchBatchInputSchema = z.object({
  label: z.string().min(1).max(160).optional(),
  createChicks: z.boolean().optional(),
  notes: z.string().max(1000).nullable().optional()
});

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change incubation cycles." });
    return null;
  }
  return user;
}

async function homesteadPreferences(homesteadId: string) {
  const result = await db.query("select preferences from homestead_settings where homestead_id = $1", [
    homesteadId
  ]);
  return (result.rows[0]?.preferences ?? {}) as Record<string, unknown>;
}

function preferenceNumber(preferences: Record<string, unknown>, key: string, fallback: number) {
  const value = Number(preferences[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validateCounts(eggsSet?: number, fertileEggs?: number | null, hatchedCount?: number | null) {
  if (eggsSet == null) return true;
  if (fertileEggs != null && fertileEggs > eggsSet) return false;
  if (hatchedCount != null && hatchedCount > eggsSet) return false;
  return true;
}

function preferenceBoolean(preferences: Record<string, unknown>, key: string, fallback: boolean) {
  const value = preferences[key];
  if (value === "yes" || value === true) return true;
  if (value === "no" || value === false) return false;
  return fallback;
}

async function normalizeMatingPeriodId(homesteadId: string, matingPeriodId?: string | null) {
  if (!matingPeriodId) return null;
  const result = await db.query("select id from mating_periods where id = $1 and homestead_id = $2", [
    matingPeriodId,
    homesteadId
  ]);
  if (!result.rows[0]) return false;
  return matingPeriodId;
}

export async function incubationRoutes(app: FastifyInstance) {
  app.get("/hatch-batches", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select batches.id,
              batches.breeding_line_id,
              lines.name as breeding_line_name,
              batches.mating_period_id,
              periods.label as mating_period_label,
              batches.incubation_id,
              incubations.label as incubation_label,
              batches.label,
              batches.hatch_date,
              batches.eggs_set,
              batches.fertile_eggs,
              batches.hatched_count,
              batches.notes,
              count(birds.id)::int as chick_count,
              batches.created_at,
              batches.updated_at
         from hatch_batches batches
         left join breeding_lines lines on lines.id = batches.breeding_line_id
         left join mating_periods periods on periods.id = batches.mating_period_id
         left join incubations on incubations.id = batches.incubation_id
         left join birds on birds.hatch_batch_id = batches.id
        where batches.homestead_id = $1
        group by batches.id, lines.name, periods.label, incubations.label
        order by batches.hatch_date desc nulls last, batches.created_at desc`,
      [user.homestead_id]
    );

    return { hatchBatches: result.rows };
  });

  app.get("/incubations", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
	      `select incubations.id,
		              incubations.mating_period_id,
		              incubations.hatch_batch_id,
                line.name as breeding_line_name,
                periods.label as mating_period_label,
		              incubations.label,
	              incubations.set_date,
	              incubations.expected_hatch_date,
	              incubations.lockdown_date,
	              incubations.candle_date,
	              incubations.eggs_set,
	              incubations.fertile_eggs,
	              incubations.hatched_count,
	              incubations.parameters,
	              incubations.notes,
	              incubations.created_at,
	              incubations.updated_at
		         from incubations
           left join mating_periods periods on periods.id = incubations.mating_period_id
           left join breeding_lines line on line.id = periods.breeding_line_id
		        where incubations.homestead_id = $1
	        order by incubations.set_date desc, incubations.created_at desc`,
      [user.homestead_id]
    );

    return { incubations: result.rows };
  });

  app.post("/incubations", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = incubationInputSchema.parse(request.body);
    const matingPeriodId = await normalizeMatingPeriodId(user.homestead_id, input.matingPeriodId);
    if (matingPeriodId === false) {
      return reply.code(400).send({ message: "Selected mating period was not found." });
    }
    if (!validateCounts(input.eggsSet, input.fertileEggs, input.hatchedCount)) {
      return reply.code(400).send({ message: "Fertile or hatched eggs cannot exceed eggs set." });
    }

    const preferences = await homesteadPreferences(user.homestead_id);
    const incubationDays = preferenceNumber(preferences, "incubationDays", 20);
    const candleDay = preferenceNumber(preferences, "candleDay", 7);
    const lockdownDay = preferenceNumber(preferences, "lockdownDay", 14);
    const expectedHatchDate = input.expectedHatchDate ?? addDays(input.setDate, incubationDays);
    const candleDate = input.candleDate ?? addDays(input.setDate, Math.max(0, candleDay - 1));
    const lockdownDate = input.lockdownDate ?? addDays(input.setDate, Math.max(0, lockdownDay - 1));

    const result = await db.query(
      `insert into incubations (
         homestead_id, mating_period_id, label, set_date, expected_hatch_date, lockdown_date, candle_date,
         eggs_set, fertile_eggs, hatched_count, parameters, notes
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id`,
      [
        user.homestead_id,
        matingPeriodId,
        input.label,
        input.setDate,
        expectedHatchDate,
        lockdownDate,
        candleDate,
        input.eggsSet,
        input.fertileEggs ?? null,
        input.hatchedCount ?? null,
        JSON.stringify(input.parameters),
        input.notes ?? null
      ]
    );

    return reply.code(201).send({ incubation: { id: result.rows[0].id } });
  });

  app.patch("/incubations/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = incubationPatchSchema.parse(request.body);
    const matingPeriodId = Object.hasOwn(input, "matingPeriodId")
      ? await normalizeMatingPeriodId(user.homestead_id, input.matingPeriodId)
      : null;
    if (matingPeriodId === false) {
      return reply.code(400).send({ message: "Selected mating period was not found." });
    }

    const current = await db.query(
      "select eggs_set, fertile_eggs, hatched_count from incubations where id = $1 and homestead_id = $2",
      [params.id, user.homestead_id]
    );
    if (!current.rows[0]) return reply.code(404).send({ message: "Incubation cycle not found." });

    const eggsSet = input.eggsSet ?? Number(current.rows[0].eggs_set);
    const fertileEggs = Object.hasOwn(input, "fertileEggs")
      ? input.fertileEggs
      : current.rows[0].fertile_eggs == null
        ? null
        : Number(current.rows[0].fertile_eggs);
    const hatchedCount = Object.hasOwn(input, "hatchedCount")
      ? input.hatchedCount
      : current.rows[0].hatched_count == null
        ? null
        : Number(current.rows[0].hatched_count);
    if (!validateCounts(eggsSet, fertileEggs, hatchedCount)) {
      return reply.code(400).send({ message: "Fertile or hatched eggs cannot exceed eggs set." });
    }

    const result = await db.query(
      `update incubations
          set mating_period_id = case when $3 then $4 else mating_period_id end,
              label = coalesce($5, label),
              set_date = coalesce($6, set_date),
              expected_hatch_date = coalesce($7, expected_hatch_date),
              lockdown_date = case when $8 then $9 else lockdown_date end,
              candle_date = case when $10 then $11 else candle_date end,
              eggs_set = coalesce($12, eggs_set),
              fertile_eggs = case when $13 then $14 else fertile_eggs end,
              hatched_count = case when $15 then $16 else hatched_count end,
              parameters = case when $17 then $18::jsonb else parameters end,
              notes = case when $19 then $20 else notes end,
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id`,
      [
        params.id,
        user.homestead_id,
        Object.hasOwn(input, "matingPeriodId"),
        matingPeriodId,
        input.label ?? null,
        input.setDate ?? null,
        input.expectedHatchDate ?? null,
        Object.hasOwn(input, "lockdownDate"),
        input.lockdownDate ?? null,
        Object.hasOwn(input, "candleDate"),
        input.candleDate ?? null,
        input.eggsSet ?? null,
        Object.hasOwn(input, "fertileEggs"),
        input.fertileEggs ?? null,
        Object.hasOwn(input, "hatchedCount"),
        input.hatchedCount ?? null,
        Object.hasOwn(input, "parameters"),
        JSON.stringify(input.parameters ?? {}),
        Object.hasOwn(input, "notes"),
        input.notes ?? null
      ]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Incubation cycle not found." });
    return { incubation: { id: result.rows[0].id } };
  });

  app.delete("/incubations/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const result = await db.query("delete from incubations where id = $1 and homestead_id = $2 returning id", [
      params.id,
      user.homestead_id
    ]);

    if (!result.rows[0]) return reply.code(404).send({ message: "Incubation cycle not found." });
    return { ok: true };
  });

  app.post("/incubations/:id/hatch-batch", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = hatchBatchInputSchema.parse(request.body);
    const preferences = await homesteadPreferences(user.homestead_id);

    const incubationResult = await db.query(
      `select incubations.id,
              incubations.hatch_batch_id,
              incubations.mating_period_id,
              incubations.label,
              incubations.expected_hatch_date,
              incubations.eggs_set,
              incubations.fertile_eggs,
              incubations.hatched_count,
              periods.breeding_line_id
         from incubations
         left join mating_periods periods on periods.id = incubations.mating_period_id
        where incubations.id = $1
          and incubations.homestead_id = $2`,
      [params.id, user.homestead_id]
    );
    const incubation = incubationResult.rows[0];
    if (!incubation) return reply.code(404).send({ message: "Incubation cycle not found." });
    if (incubation.hatch_batch_id) {
      return reply.code(409).send({ message: "This incubation already has a hatch batch." });
    }
    if (incubation.hatched_count == null) {
      return reply.code(400).send({ message: "Record the hatched count before creating a hatch batch." });
    }

    const createChicks = input.createChicks ?? preferenceBoolean(preferences, "autoCreateChickRecords", true);
    const hatchedCount = Number(incubation.hatched_count);
    const label = input.label || `${incubation.label} hatch`;
    const client = await db.connect();

    try {
      await client.query("begin");
      const batchResult = await client.query(
        `insert into hatch_batches (
           homestead_id, breeding_line_id, mating_period_id, incubation_id, label, hatch_date,
           eggs_set, fertile_eggs, hatched_count, notes
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          user.homestead_id,
          incubation.breeding_line_id ?? null,
          incubation.mating_period_id ?? null,
          incubation.id,
          label,
          incubation.expected_hatch_date,
          incubation.eggs_set,
          incubation.fertile_eggs ?? null,
          hatchedCount,
          input.notes ?? null
        ]
      );
      const batchId = batchResult.rows[0].id;

      await client.query(
        `update incubations
            set hatch_batch_id = $3,
                updated_at = now()
          where id = $1
            and homestead_id = $2`,
        [incubation.id, user.homestead_id, batchId]
      );

      if (createChicks) {
        for (let index = 1; index <= hatchedCount; index += 1) {
          await client.query(
            `insert into birds (
               homestead_id, hatch_batch_id, breeding_line_id, name, band, sex, status, hatch_date, notes
             )
             values ($1, $2, $3, $4, null, 'UNKNOWN', 'ACTIVE', $5, $6)`,
            [
              user.homestead_id,
              batchId,
              incubation.breeding_line_id ?? null,
              `${label} chick ${index}`,
              incubation.expected_hatch_date,
              `Auto-created from incubation ${incubation.label}.`
            ]
          );
        }
      }

      await client.query("commit");
      return reply.code(201).send({ hatchBatch: { id: batchId, chickCount: createChicks ? hatchedCount : 0 } });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
}
