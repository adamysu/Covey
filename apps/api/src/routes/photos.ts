import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const entityTypeSchema = z.enum(["BIRD", "FEED", "HEALTH_EVENT"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const extensionByMime = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);

const photoInputSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
  fileName: z.string().min(1).max(180),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  dataUrl: z.string().min(1),
  caption: z.string().max(240).nullable().optional()
});

const photoQuerySchema = z.object({
  entityType: entityTypeSchema.optional(),
  entityId: z.string().uuid().optional()
});

const paramsSchema = z.object({ id: z.string().uuid() });

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change photos." });
    return null;
  }
  return user;
}

async function ensureEntityOwned(entityType: z.infer<typeof entityTypeSchema>, entityId: string, homesteadId: string) {
  const table = entityType === "BIRD" ? "birds" : entityType === "FEED" ? "feed_types" : "bird_health_events";
  const result = await db.query(`select id from ${table} where id = $1 and homestead_id = $2`, [entityId, homesteadId]);
  return Boolean(result.rows[0]);
}

function parseDataUrl(dataUrl: string, mimeType: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match || match[1] !== mimeType || !allowedMimeTypes.has(mimeType)) return null;
  return Buffer.from(match[2], "base64");
}

function safeFileBase(fileName: string) {
  const parsed = basename(fileName, extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return parsed || "photo";
}

export async function photoRoutes(app: FastifyInstance) {
  app.get("/photos", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const query = photoQuerySchema.parse(request.query);
    const result = await db.query(
      `select id, entity_type, entity_id, file_name, mime_type, byte_size, caption, created_at
         from photo_attachments
        where homestead_id = $1
          and ($2::text is null or entity_type = $2)
          and ($3::uuid is null or entity_id = $3)
        order by created_at desc`,
      [user.homestead_id, query.entityType ?? null, query.entityId ?? null]
    );

    return { photos: result.rows };
  });

  app.post("/photos", { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = photoInputSchema.parse(request.body);
    if (!(await ensureEntityOwned(input.entityType, input.entityId, user.homestead_id))) {
      return reply.code(400).send({ message: "Selected record was not found." });
    }

    const bytes = parseDataUrl(input.dataUrl, input.mimeType);
    if (!bytes?.length) return reply.code(400).send({ message: "Photo data was not valid." });
    if (bytes.length > 5 * 1024 * 1024) return reply.code(400).send({ message: "Photos must be 5 MB or smaller." });

    const extension = extensionByMime.get(input.mimeType) ?? ".img";
    const fileName = `${Date.now()}-${safeFileBase(input.fileName)}${extension}`;
    const folder = join(env.UPLOAD_DIR, user.homestead_id, input.entityType.toLowerCase());
    const storagePath = join(folder, fileName);
    await mkdir(folder, { recursive: true });
    await writeFile(storagePath, bytes);

    const result = await db.query(
      `insert into photo_attachments (homestead_id, entity_type, entity_id, file_name, mime_type, storage_path, byte_size, caption)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        user.homestead_id,
        input.entityType,
        input.entityId,
        input.fileName,
        input.mimeType,
        storagePath,
        bytes.length,
        input.caption ?? null
      ]
    );
    const replaced = await db.query(
      `delete from photo_attachments
        where homestead_id = $1
          and entity_type = $2
          and entity_id = $3
          and id <> $4
        returning storage_path`,
      [user.homestead_id, input.entityType, input.entityId, result.rows[0].id]
    );
    await Promise.all(replaced.rows.map((row) => unlink(row.storage_path).catch(() => undefined)));

    return reply.code(201).send({ photo: { id: result.rows[0].id } });
  });

  app.get("/photos/:id/content", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const params = paramsSchema.parse(request.params);
    const result = await db.query(
      `select file_name, mime_type, storage_path
         from photo_attachments
        where id = $1
          and homestead_id = $2`,
      [params.id, user.homestead_id]
    );
    const photo = result.rows[0];
    if (!photo) return reply.code(404).send({ message: "Photo not found." });
    const fileInfo = await stat(photo.storage_path).catch(() => null);
    if (!fileInfo) return reply.code(404).send({ message: "Photo file is missing from disk." });

    reply.header("Content-Type", photo.mime_type);
    reply.header("Content-Length", String(fileInfo.size));
    reply.header("Cache-Control", "private, max-age=3600");
    return reply.send(createReadStream(photo.storage_path));
  });

  app.delete("/photos/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const result = await db.query(
      `delete from photo_attachments
        where id = $1
          and homestead_id = $2
        returning storage_path`,
      [params.id, user.homestead_id]
    );
    if (!result.rows[0]) return reply.code(404).send({ message: "Photo not found." });
    await unlink(result.rows[0].storage_path).catch(() => undefined);
    return { ok: true };
  });
}
