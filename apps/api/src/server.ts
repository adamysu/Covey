import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { auditRoutes, installAuditHook } from "./routes/audit.js";
import { authRoutes } from "./routes/auth.js";
import { birdRoutes } from "./routes/birds.js";
import { breedingRoutes } from "./routes/breeding.js";
import { coopRoutes } from "./routes/coops.js";
import { dataRoutes, startBackupScheduler } from "./routes/data.js";
import { eggRoutes } from "./routes/eggs.js";
import { feedRoutes } from "./routes/feed.js";
import { healthRecordRoutes } from "./routes/healthRecords.js";
import { healthRoutes } from "./routes/health.js";
import { homesteadRoutes } from "./routes/homestead.js";
import { incubationRoutes } from "./routes/incubations.js";
import { photoRoutes } from "./routes/photos.js";
import { saleRoutes } from "./routes/sales.js";

const app = Fastify({
  logger: true,
  trustProxy: true
});

await app.register(helmet);
await app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
});
await app.register(cookie);
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute"
});

installAuditHook(app);

function postgresErrorMessage(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = String(error.code);
  const detail = "detail" in error && typeof error.detail === "string" ? error.detail : "";
  const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";

  if (code === "23505") return { status: 409, message: "That record already exists." };
  if (code === "23503") {
    return {
      status: 409,
      message: "This record is still linked to other records. Archive or update those links first."
    };
  }
  if (code === "23514") {
    return {
      status: 400,
      message: constraint || detail ? `Database rule failed: ${constraint || detail}` : "Database rule failed for this change."
    };
  }
  if (code === "23502") return { status: 400, message: "A required database field was missing." };
  if (code === "22P02") return { status: 400, message: "One of the record identifiers was not valid." };
  if (code === "42703" || code === "42P01") {
    return {
      status: 503,
      message: "Database schema is out of date. Restart the API so migrations can run, then try again."
    };
  }

  return null;
}

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      message: "Please check the highlighted fields.",
      issues: error.issues
    });
  }

  const databaseMessage = postgresErrorMessage(error);
  if (databaseMessage) {
    app.log.error(error);
    return reply.code(databaseMessage.status).send({ message: databaseMessage.message });
  }

  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    const message = "message" in error && typeof error.message === "string" ? error.message : "Request could not be completed.";
    return reply.code(error.statusCode).send({ message });
  }

  app.log.error(error);
  return reply.code(500).send({ message: "The server could not complete that request. Check the API logs for details." });
});

await app.register(healthRoutes);
await app.register(auditRoutes);
await app.register(authRoutes);
await app.register(homesteadRoutes);
await app.register(coopRoutes);
await app.register(dataRoutes);
await app.register(birdRoutes);
await app.register(breedingRoutes);
await app.register(feedRoutes);
await app.register(eggRoutes);
await app.register(incubationRoutes);
await app.register(saleRoutes);
await app.register(healthRecordRoutes);
await app.register(photoRoutes);

startBackupScheduler(app.log);

await app.listen({ host: "0.0.0.0", port: env.API_PORT });
