import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const feedInputSchema = z.object({
  brand: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  vendor: z.string().max(160).nullable().optional(),
  proteinPercent: z.number().min(0).max(100).nullable().optional(),
  bagWeightLb: z.number().positive(),
  bagCost: z.number().min(0),
  cupWeightOz: z.number().positive().optional(),
  inventoryCups: z.number().min(0).optional(),
  active: z.boolean().optional()
});

const feedPatchSchema = feedInputSchema.partial();

const feedLogInputSchema = z.object({
  coopId: z.string().uuid(),
  feedTypeId: z.string().uuid(),
  loggedAt: z.string().datetime().optional(),
  amount: z.number().positive(),
  unit: z.enum(["cup", "lb", "oz"]),
  notes: z.string().max(1000).nullable().optional()
});

const feedLogPatchSchema = feedLogInputSchema.partial();

const feedInventoryInputSchema = z.object({
  feedTypeId: z.string().uuid(),
  loggedAt: z.string().datetime().optional(),
  amount: z.number().positive(),
  unit: z.enum(["bag", "cup", "lb", "oz"]),
  cost: z.number().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional()
});

const feedInventoryPatchSchema = feedInventoryInputSchema.partial();

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
    reply.code(403).send({ message: "Read-only users cannot change feed records." });
    return null;
  }
  return user;
}

async function ensureOwned(table: "coops" | "feed_types", id: string, homesteadId: string) {
  const result = await db.query(`select id from ${table} where id = $1 and homestead_id = $2`, [
    id,
    homesteadId
  ]);
  return Boolean(result.rows[0]);
}

function feedLogAmountCups(amount: number, unit: "cup" | "lb" | "oz", cupWeightOz: number) {
  if (unit === "cup") return amount;
  if (unit === "lb") return (amount * 16) / cupWeightOz;
  return amount / cupWeightOz;
}

function feedInventoryAmountCups(
  amount: number,
  unit: "bag" | "cup" | "lb" | "oz",
  cupWeightOz: number,
  bagWeightLb: number
) {
  if (unit === "bag") return (amount * bagWeightLb * 16) / cupWeightOz;
  if (unit === "cup") return amount;
  if (unit === "lb") return (amount * 16) / cupWeightOz;
  return amount / cupWeightOz;
}

export async function feedRoutes(app: FastifyInstance) {
  app.get("/feed-types", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select id,
              brand,
              name,
              vendor,
              protein_percent,
              bag_weight_lb,
	              bag_cost,
	              cup_weight_oz,
	              inventory_cups,
	              active,
              created_at,
              updated_at
         from feed_types
        where homestead_id = $1
        order by active desc, brand asc, name asc`,
      [user.homestead_id]
    );

    return { feedTypes: result.rows };
  });

  app.post("/feed-types", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = feedInputSchema.parse(request.body);

    const result = await db.query(
      `insert into feed_types (
	         homestead_id, brand, name, vendor, protein_percent, bag_weight_lb, bag_cost, cup_weight_oz, inventory_cups, active
	       )
	       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       returning id`,
      [
        user.homestead_id,
        input.brand,
        input.name,
        input.vendor ?? null,
        input.proteinPercent ?? null,
	        input.bagWeightLb,
	        input.bagCost,
		        input.cupWeightOz ?? 8,
		        input.inventoryCups ?? 0,
		        input.active ?? true
      ]
    );

    return reply.code(201).send({ feedType: { id: result.rows[0].id } });
  });

  app.patch("/feed-types/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = feedPatchSchema.parse(request.body);

    const result = await db.query(
      `update feed_types
          set brand = coalesce($3, brand),
              name = coalesce($4, name),
              vendor = case when $5 then $6 else vendor end,
              protein_percent = case when $7 then $8 else protein_percent end,
	              bag_weight_lb = coalesce($9, bag_weight_lb),
	              bag_cost = coalesce($10, bag_cost),
	              cup_weight_oz = coalesce($11, cup_weight_oz),
	              inventory_cups = coalesce($12, inventory_cups),
	              active = coalesce($13, active),
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id`,
      [
        params.id,
        user.homestead_id,
        input.brand ?? null,
        input.name ?? null,
        Object.hasOwn(input, "vendor"),
        input.vendor ?? null,
        Object.hasOwn(input, "proteinPercent"),
        input.proteinPercent ?? null,
	        input.bagWeightLb ?? null,
	        input.bagCost ?? null,
	        input.cupWeightOz ?? null,
	        input.inventoryCups ?? null,
	        input.active ?? null
      ]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Feed not found." });
    return { feedType: { id: result.rows[0].id } };
  });

  app.delete("/feed-types/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const inUse = await db.query(
      "select id from feed_logs where feed_type_id = $1 and homestead_id = $2 limit 1",
      [params.id, user.homestead_id]
    );
    if (inUse.rows[0]) return reply.code(409).send({ message: "That feed has logs attached." });

    const result = await db.query(
      "delete from feed_types where id = $1 and homestead_id = $2 returning id",
      [params.id, user.homestead_id]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Feed not found." });
    return { ok: true };
  });

  app.get("/feed-logs", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select feed_logs.id,
              feed_logs.coop_id,
              coops.name as coop_name,
              feed_logs.feed_type_id,
              feed_types.brand as feed_brand,
              feed_types.name as feed_name,
              feed_types.bag_weight_lb,
              feed_types.bag_cost,
              feed_types.cup_weight_oz,
              feed_logs.logged_at,
              feed_logs.amount,
              feed_logs.unit,
              feed_logs.notes,
              (
                select count(*)
                  from birds
                 where birds.homestead_id = feed_logs.homestead_id
                   and birds.coop_id = feed_logs.coop_id
                   and birds.status = 'ACTIVE'
              ) as active_bird_count,
              case feed_logs.unit
                when 'cup' then feed_logs.amount * feed_types.cup_weight_oz / 16
                when 'oz' then feed_logs.amount / 16
                else feed_logs.amount
              end as amount_lb,
              case feed_logs.unit
                when 'cup' then feed_logs.amount * (feed_types.bag_cost / ((feed_types.bag_weight_lb * 16) / feed_types.cup_weight_oz))
                when 'oz' then (feed_logs.amount / 16) * (feed_types.bag_cost / feed_types.bag_weight_lb)
                else feed_logs.amount * (feed_types.bag_cost / feed_types.bag_weight_lb)
              end as cost
         from feed_logs
         join coops on coops.id = feed_logs.coop_id
         join feed_types on feed_types.id = feed_logs.feed_type_id
        where feed_logs.homestead_id = $1
        order by feed_logs.logged_at desc`,
      [user.homestead_id]
    );

    return { feedLogs: result.rows };
  });

  app.get("/feed-inventory-events", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select feed_inventory_events.id,
              feed_inventory_events.feed_type_id,
              feed_types.brand as feed_brand,
              feed_types.name as feed_name,
              feed_inventory_events.logged_at,
              feed_inventory_events.amount,
              feed_inventory_events.unit,
              feed_inventory_events.amount_cups,
              feed_inventory_events.cost,
              feed_inventory_events.notes,
              feed_inventory_events.created_at,
              feed_inventory_events.updated_at
         from feed_inventory_events
         join feed_types on feed_types.id = feed_inventory_events.feed_type_id
        where feed_inventory_events.homestead_id = $1
        order by feed_inventory_events.logged_at desc, feed_inventory_events.created_at desc`,
      [user.homestead_id]
    );

    return { feedInventoryEvents: result.rows };
  });

  app.post("/feed-inventory-events", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = feedInventoryInputSchema.parse(request.body);

    if (!(await ensureOwned("feed_types", input.feedTypeId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected feed was not found." });
    }

    const feed = await db.query(
      "select cup_weight_oz, bag_weight_lb, bag_cost from feed_types where id = $1 and homestead_id = $2",
      [input.feedTypeId, user.homestead_id]
    );
    const amountCups = feedInventoryAmountCups(
      input.amount,
      input.unit,
      Number(feed.rows[0].cup_weight_oz),
      Number(feed.rows[0].bag_weight_lb)
    );
    const cost = input.cost ?? (input.unit === "bag" ? input.amount * Number(feed.rows[0].bag_cost) : null);

    const result = await db.query(
      `insert into feed_inventory_events (homestead_id, feed_type_id, logged_at, amount, unit, amount_cups, cost, notes)
       values ($1, $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7, $8)
       returning id`,
      [
        user.homestead_id,
        input.feedTypeId,
        input.loggedAt ?? null,
        input.amount,
        input.unit,
        amountCups,
        cost,
        input.notes ?? null
      ]
    );
    await db.query(
      `update feed_types
          set inventory_cups = inventory_cups + $3,
              updated_at = now()
        where id = $1
          and homestead_id = $2`,
      [input.feedTypeId, user.homestead_id, amountCups]
    );

    return reply.code(201).send({ feedInventoryEvent: { id: result.rows[0].id } });
  });

  app.post("/feed-logs", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = feedLogInputSchema.parse(request.body);

    if (!(await ensureOwned("coops", input.coopId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected coop was not found." });
    }
    if (!(await ensureOwned("feed_types", input.feedTypeId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected feed was not found." });
    }

    const feed = await db.query(
      "select cup_weight_oz from feed_types where id = $1 and homestead_id = $2",
      [input.feedTypeId, user.homestead_id]
    );
    const amountCups = feedLogAmountCups(input.amount, input.unit, Number(feed.rows[0].cup_weight_oz));

    const result = await db.query(
      `insert into feed_logs (homestead_id, coop_id, feed_type_id, logged_at, amount, unit, notes)
       values ($1, $2, $3, coalesce($4::timestamptz, now()), $5, $6, $7)
       returning id`,
      [
        user.homestead_id,
        input.coopId,
        input.feedTypeId,
        input.loggedAt ?? null,
        input.amount,
        input.unit,
        input.notes ?? null
      ]
    );
    await db.query(
      `update feed_types
          set inventory_cups = greatest(0, inventory_cups - $3),
              updated_at = now()
        where id = $1
          and homestead_id = $2`,
      [input.feedTypeId, user.homestead_id, amountCups]
    );

    return reply.code(201).send({ feedLog: { id: result.rows[0].id } });
  });

  app.patch("/feed-inventory-events/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = feedInventoryPatchSchema.parse(request.body);

    if (input.feedTypeId && !(await ensureOwned("feed_types", input.feedTypeId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected feed was not found." });
    }

    const current = await db.query(
      `select feed_inventory_events.feed_type_id,
              feed_inventory_events.amount,
              feed_inventory_events.unit,
              feed_inventory_events.amount_cups,
              feed_types.cup_weight_oz,
              feed_types.bag_weight_lb
         from feed_inventory_events
         join feed_types on feed_types.id = feed_inventory_events.feed_type_id
        where feed_inventory_events.id = $1
          and feed_inventory_events.homestead_id = $2`,
      [params.id, user.homestead_id]
    );
    if (!current.rows[0]) return reply.code(404).send({ message: "Feed restock not found." });

    const nextFeedTypeId = input.feedTypeId ?? current.rows[0].feed_type_id;
    const nextFeed = await db.query(
      "select cup_weight_oz, bag_weight_lb from feed_types where id = $1 and homestead_id = $2",
      [nextFeedTypeId, user.homestead_id]
    );
    const nextCups =
      input.amount || input.unit || input.feedTypeId
        ? feedInventoryAmountCups(
            input.amount ?? Number(current.rows[0].amount),
            input.unit ?? current.rows[0].unit,
            Number(nextFeed.rows[0].cup_weight_oz),
            Number(nextFeed.rows[0].bag_weight_lb)
          )
        : Number(current.rows[0].amount_cups);

    const result = await db.query(
      `update feed_inventory_events
          set feed_type_id = coalesce($3, feed_type_id),
              logged_at = coalesce($4::timestamptz, logged_at),
              amount = coalesce($5, amount),
              unit = coalesce($6, unit),
              amount_cups = $7,
              cost = case when $8 then $9 else cost end,
              notes = case when $10 then $11 else notes end,
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id`,
      [
        params.id,
        user.homestead_id,
        input.feedTypeId ?? null,
        input.loggedAt ?? null,
        input.amount ?? null,
        input.unit ?? null,
        nextCups,
        Object.hasOwn(input, "cost"),
        input.cost ?? null,
        Object.hasOwn(input, "notes"),
        input.notes ?? null
      ]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Feed restock not found." });
    if (nextFeedTypeId === current.rows[0].feed_type_id) {
      await db.query(
        `update feed_types
            set inventory_cups = greatest(0, inventory_cups - $3 + $4),
                updated_at = now()
          where id = $1
            and homestead_id = $2`,
        [nextFeedTypeId, user.homestead_id, Number(current.rows[0].amount_cups), nextCups]
      );
    } else {
      await db.query(
        `update feed_types
            set inventory_cups = greatest(0, inventory_cups - $3),
                updated_at = now()
          where id = $1
            and homestead_id = $2`,
        [current.rows[0].feed_type_id, user.homestead_id, Number(current.rows[0].amount_cups)]
      );
      await db.query(
        `update feed_types
            set inventory_cups = inventory_cups + $3,
                updated_at = now()
          where id = $1
            and homestead_id = $2`,
        [nextFeedTypeId, user.homestead_id, nextCups]
      );
    }
    return { feedInventoryEvent: { id: result.rows[0].id } };
  });

  app.delete("/feed-inventory-events/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const current = await db.query(
      `select feed_type_id, amount_cups
         from feed_inventory_events
        where id = $1
          and homestead_id = $2`,
      [params.id, user.homestead_id]
    );
    if (!current.rows[0]) return reply.code(404).send({ message: "Feed restock not found." });

    const result = await db.query(
      "delete from feed_inventory_events where id = $1 and homestead_id = $2 returning id",
      [params.id, user.homestead_id]
    );
    if (!result.rows[0]) return reply.code(404).send({ message: "Feed restock not found." });

    await db.query(
      `update feed_types
          set inventory_cups = greatest(0, inventory_cups - $3),
              updated_at = now()
        where id = $1
          and homestead_id = $2`,
      [current.rows[0].feed_type_id, user.homestead_id, Number(current.rows[0].amount_cups)]
    );

    return { ok: true };
  });

  app.patch("/feed-logs/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = feedLogPatchSchema.parse(request.body);

    if (input.coopId && !(await ensureOwned("coops", input.coopId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected coop was not found." });
    }
    if (input.feedTypeId && !(await ensureOwned("feed_types", input.feedTypeId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected feed was not found." });
    }

    const current = await db.query(
      `select feed_logs.feed_type_id,
              feed_logs.amount,
              feed_logs.unit,
              feed_types.cup_weight_oz
         from feed_logs
         join feed_types on feed_types.id = feed_logs.feed_type_id
        where feed_logs.id = $1
          and feed_logs.homestead_id = $2`,
      [params.id, user.homestead_id]
    );
    if (!current.rows[0]) return reply.code(404).send({ message: "Feed log not found." });

    const result = await db.query(
      `update feed_logs
          set coop_id = coalesce($3, coop_id),
              feed_type_id = coalesce($4, feed_type_id),
              logged_at = coalesce($5::timestamptz, logged_at),
              amount = coalesce($6, amount),
              unit = coalesce($7, unit),
              notes = case when $8 then $9 else notes end,
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id`,
      [
        params.id,
        user.homestead_id,
        input.coopId ?? null,
        input.feedTypeId ?? null,
        input.loggedAt ?? null,
        input.amount ?? null,
        input.unit ?? null,
        Object.hasOwn(input, "notes"),
        input.notes ?? null
      ]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Feed log not found." });
    const nextFeedTypeId = input.feedTypeId ?? current.rows[0].feed_type_id;
    const nextFeed = await db.query("select cup_weight_oz from feed_types where id = $1 and homestead_id = $2", [
      nextFeedTypeId,
      user.homestead_id
    ]);
    const originalCups = feedLogAmountCups(
      Number(current.rows[0].amount),
      current.rows[0].unit,
      Number(current.rows[0].cup_weight_oz)
    );
    const nextCups = feedLogAmountCups(
      input.amount ?? Number(current.rows[0].amount),
      input.unit ?? current.rows[0].unit,
      Number(nextFeed.rows[0].cup_weight_oz)
    );
    if (nextFeedTypeId === current.rows[0].feed_type_id) {
      await db.query(
        `update feed_types
            set inventory_cups = greatest(0, inventory_cups + $3 - $4),
                updated_at = now()
          where id = $1
            and homestead_id = $2`,
        [nextFeedTypeId, user.homestead_id, originalCups, nextCups]
      );
    } else {
      await db.query(
        `update feed_types
            set inventory_cups = inventory_cups + $3,
                updated_at = now()
          where id = $1
            and homestead_id = $2`,
        [current.rows[0].feed_type_id, user.homestead_id, originalCups]
      );
      await db.query(
        `update feed_types
            set inventory_cups = greatest(0, inventory_cups - $3),
                updated_at = now()
          where id = $1
            and homestead_id = $2`,
        [nextFeedTypeId, user.homestead_id, nextCups]
      );
    }
    return { feedLog: { id: result.rows[0].id } };
  });

  app.delete("/feed-logs/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const current = await db.query(
      `select feed_logs.feed_type_id,
              feed_logs.amount,
              feed_logs.unit,
              feed_types.cup_weight_oz
         from feed_logs
         join feed_types on feed_types.id = feed_logs.feed_type_id
        where feed_logs.id = $1
          and feed_logs.homestead_id = $2`,
      [params.id, user.homestead_id]
    );
    if (!current.rows[0]) return reply.code(404).send({ message: "Feed log not found." });

    const result = await db.query(
      "delete from feed_logs where id = $1 and homestead_id = $2 returning id",
      [params.id, user.homestead_id]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Feed log not found." });
    const returnedCups = feedLogAmountCups(
      Number(current.rows[0].amount),
      current.rows[0].unit,
      Number(current.rows[0].cup_weight_oz)
    );
    await db.query(
      `update feed_types
          set inventory_cups = inventory_cups + $3,
              updated_at = now()
        where id = $1
          and homestead_id = $2`,
      [current.rows[0].feed_type_id, user.homestead_id, returnedCups]
    );
    return { ok: true };
  });
}
