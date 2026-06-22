import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const saleItemTypeSchema = z.enum(["TABLE_EGGS", "FERTILE_EGGS", "CHICKS", "BIRDS", "MEAT", "OTHER"]);

const saleInputSchema = z.object({
  soldOn: z.string().date(),
  itemType: saleItemTypeSchema,
  quantity: z.number().positive(),
  unit: z.string().max(40).default("each"),
  unitPrice: z.number().min(0),
  buyer: z.string().max(200).nullable().optional(),
  coopId: z.string().uuid().nullable().optional(),
  birdId: z.string().uuid().nullable().optional(),
  breedingLineId: z.string().uuid().nullable().optional(),
  matingPeriodId: z.string().uuid().nullable().optional(),
  incubationId: z.string().uuid().nullable().optional(),
  hatchBatchId: z.string().uuid().nullable().optional(),
  notes: z.string().max(1000).nullable().optional()
});

const salePatchSchema = saleInputSchema.partial();
const paramsSchema = z.object({ id: z.string().uuid() });

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change sales records." });
    return null;
  }
  return user;
}

async function ensureOwned(table: string, id: string | null | undefined, homesteadId: string) {
  if (!id) return true;
  const result = await db.query(`select id from ${table} where id = $1 and homestead_id = $2`, [id, homesteadId]);
  return Boolean(result.rows[0]);
}

async function validateLinks(input: z.infer<typeof salePatchSchema>, homesteadId: string, reply: FastifyReply) {
  const checks: Array<[string, string | null | undefined, string]> = [
    ["coops", input.coopId, "Selected coop was not found."],
    ["birds", input.birdId, "Selected bird was not found."],
    ["breeding_lines", input.breedingLineId, "Selected breeding line was not found."],
    ["mating_periods", input.matingPeriodId, "Selected mating period was not found."],
    ["incubations", input.incubationId, "Selected incubation was not found."],
    ["hatch_batches", input.hatchBatchId, "Selected hatch batch was not found."]
  ];

  for (const [table, id, message] of checks) {
    if (!(await ensureOwned(table, id, homesteadId))) {
      reply.code(400).send({ message });
      return false;
    }
  }

  return true;
}

export async function saleRoutes(app: FastifyInstance) {
  app.get("/sales", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select sales.id,
              sales.sold_on,
              sales.item_type,
              sales.quantity,
              sales.unit,
              sales.unit_price,
              sales.total_price,
              sales.buyer,
              sales.coop_id,
              coops.name as coop_name,
              sales.bird_id,
              birds.name as bird_name,
              birds.band as bird_band,
              sales.breeding_line_id,
              breeding_lines.name as breeding_line_name,
              sales.mating_period_id,
              mating_periods.label as mating_period_label,
              sales.incubation_id,
              incubations.label as incubation_label,
              sales.hatch_batch_id,
              hatch_batches.label as hatch_batch_label,
              sales.notes,
              sales.created_at,
              sales.updated_at
         from sales
         left join coops on coops.id = sales.coop_id
         left join birds on birds.id = sales.bird_id
         left join breeding_lines on breeding_lines.id = sales.breeding_line_id
         left join mating_periods on mating_periods.id = sales.mating_period_id
         left join incubations on incubations.id = sales.incubation_id
         left join hatch_batches on hatch_batches.id = sales.hatch_batch_id
        where sales.homestead_id = $1
        order by sales.sold_on desc, sales.created_at desc`,
      [user.homestead_id]
    );

    return { sales: result.rows };
  });

  app.post("/sales", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = saleInputSchema.parse(request.body);
    if (!(await validateLinks(input, user.homestead_id, reply))) return;

    const result = await db.query(
      `insert into sales (
         homestead_id, sold_on, item_type, quantity, unit, unit_price, buyer, coop_id, bird_id,
         breeding_line_id, mating_period_id, incubation_id, hatch_batch_id, notes
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       returning id`,
      [
        user.homestead_id,
        input.soldOn,
        input.itemType,
        input.quantity,
        input.unit,
        input.unitPrice,
        input.buyer ?? null,
        input.coopId ?? null,
        input.birdId ?? null,
        input.breedingLineId ?? null,
        input.matingPeriodId ?? null,
        input.incubationId ?? null,
        input.hatchBatchId ?? null,
        input.notes ?? null
      ]
    );

    return reply.code(201).send({ sale: { id: result.rows[0].id } });
  });

  app.patch("/sales/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = salePatchSchema.parse(request.body);
    if (!(await validateLinks(input, user.homestead_id, reply))) return;

    const result = await db.query(
      `update sales
          set sold_on = coalesce($3, sold_on),
              item_type = coalesce($4, item_type),
              quantity = coalesce($5, quantity),
              unit = coalesce($6, unit),
              unit_price = coalesce($7, unit_price),
              buyer = case when $8 then $9 else buyer end,
              coop_id = case when $10 then $11 else coop_id end,
              bird_id = case when $12 then $13 else bird_id end,
              breeding_line_id = case when $14 then $15 else breeding_line_id end,
              mating_period_id = case when $16 then $17 else mating_period_id end,
              incubation_id = case when $18 then $19 else incubation_id end,
              hatch_batch_id = case when $20 then $21 else hatch_batch_id end,
              notes = case when $22 then $23 else notes end,
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id`,
      [
        params.id,
        user.homestead_id,
        input.soldOn ?? null,
        input.itemType ?? null,
        input.quantity ?? null,
        input.unit ?? null,
        input.unitPrice ?? null,
        Object.hasOwn(input, "buyer"),
        input.buyer ?? null,
        Object.hasOwn(input, "coopId"),
        input.coopId ?? null,
        Object.hasOwn(input, "birdId"),
        input.birdId ?? null,
        Object.hasOwn(input, "breedingLineId"),
        input.breedingLineId ?? null,
        Object.hasOwn(input, "matingPeriodId"),
        input.matingPeriodId ?? null,
        Object.hasOwn(input, "incubationId"),
        input.incubationId ?? null,
        Object.hasOwn(input, "hatchBatchId"),
        input.hatchBatchId ?? null,
        Object.hasOwn(input, "notes"),
        input.notes ?? null
      ]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Sale not found." });
    return { sale: { id: result.rows[0].id } };
  });

  app.delete("/sales/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const result = await db.query("delete from sales where id = $1 and homestead_id = $2 returning id", [
      params.id,
      user.homestead_id
    ]);
    if (!result.rows[0]) return reply.code(404).send({ message: "Sale not found." });
    return { ok: true };
  });
}
