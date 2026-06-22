import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const auditQuerySchema = z.object({
  action: z.string().max(40).optional(),
  entityType: z.string().max(80).optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const entityPathMap: Array<[RegExp, string]> = [
  [/^\/auth\/users(?:\/|$)/, "user"],
  [/^\/auth\/mfa(?:\/|$)/, "security"],
  [/^\/auth\/logout$/, "session"],
  [/^\/homestead$/, "homestead"],
  [/^\/coops(?:\/|$)/, "coop"],
  [/^\/birds(?:\/|$)/, "bird"],
  [/^\/weight-logs(?:\/|$)/, "weight_log"],
  [/^\/breeding-lines(?:\/|$)/, "breeding_line"],
  [/^\/mating-periods(?:\/|$)/, "mating_period"],
  [/^\/feed-types(?:\/|$)/, "feed"],
  [/^\/feed-logs(?:\/|$)/, "feed_log"],
  [/^\/feed-inventory-events(?:\/|$)/, "feed_inventory"],
  [/^\/egg-logs(?:\/|$)/, "egg_log"],
  [/^\/incubations(?:\/|$)/, "incubation"],
  [/^\/hatch-batches(?:\/|$)/, "hatch_batch"],
  [/^\/data\/import(?:\/|$)/, "data_import"],
  [/^\/data\/backups(?:\/|$)/, "backup"]
];

const actionMap: Record<string, string> = {
  POST: "create",
  PATCH: "update",
  DELETE: "delete"
};

function actionFor(method: string) {
  return actionMap[method] ?? method.toLowerCase();
}

function entityTypeFor(path: string) {
  return entityPathMap.find(([pattern]) => pattern.test(path))?.[1] ?? path.split("/").filter(Boolean)[0] ?? "unknown";
}

function entityIdFromParams(params: unknown) {
  if (!params || typeof params !== "object" || !("id" in params)) return null;
  const id = String((params as { id?: unknown }).id ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

function shouldAudit(request: FastifyRequest, statusCode: number) {
  if (!["POST", "PATCH", "DELETE"].includes(request.method)) return false;
  if (statusCode >= 400) return false;
  const path = request.url.split("?")[0] ?? request.url;
  if (path.startsWith("/audit-events") || path.startsWith("/health")) return false;
  if (path.includes("/camera/")) return false;
  if (path === "/auth/login" || path === "/auth/register" || path.startsWith("/auth/password-reset")) return false;
  return true;
}

export function installAuditHook(app: FastifyInstance) {
  app.addHook("onResponse", async (request, reply) => {
    if (!shouldAudit(request, reply.statusCode)) return;

    const user = await getSessionUser(request).catch(() => null);
    if (!user) return;

    const path = request.url.split("?")[0] ?? request.url;
    await db
      .query(
        `insert into audit_events (homestead_id, user_id, action, entity_type, entity_id, metadata)
         values ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          user.homestead_id,
          user.id,
          actionFor(request.method),
          entityTypeFor(path),
          entityIdFromParams(request.params),
          JSON.stringify({
            method: request.method,
            path,
            statusCode: reply.statusCode
          })
        ]
      )
      .catch((error) => request.log.error({ error }, "Failed to write audit event."));
  });
}

export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit-events", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const query = auditQuerySchema.parse(request.query);
    const filters = ["audit_events.homestead_id = $1"];
    const params: unknown[] = [user.homestead_id];

    if (query.action) {
      params.push(query.action);
      filters.push(`audit_events.action = $${params.length}`);
    }
    if (query.entityType) {
      params.push(query.entityType);
      filters.push(`audit_events.entity_type = $${params.length}`);
    }
    if (query.userId) {
      params.push(query.userId);
      filters.push(`audit_events.user_id = $${params.length}`);
    }
    params.push(query.limit);

    const result = await db.query(
      `select audit_events.id,
              audit_events.action,
              audit_events.entity_type,
              audit_events.entity_id,
              audit_events.metadata,
              audit_events.created_at,
              users.id as user_id,
              users.display_name as user_display_name,
              users.email as user_email
         from audit_events
         left join users on users.id = audit_events.user_id
        where ${filters.join(" and ")}
        order by audit_events.created_at desc
        limit $${params.length}`,
      params
    );

    return { auditEvents: result.rows };
  });
}
