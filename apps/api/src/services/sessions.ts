import { createHash, randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db.js";
import { env } from "../config/env.js";

const cookieName = "covey_session";
const defaultSessionHours = 24;
const defaultRememberMeDays = 30;

function hashToken(token: string) {
  return createHash("sha256").update(`${token}.${env.SESSION_SECRET}`).digest("hex");
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export async function createSession(reply: FastifyReply, userId: string, rememberMe = false) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const settings = await db.query(
    `select homestead_settings.preferences
       from users
       join homestead_settings on homestead_settings.homestead_id = users.homestead_id
      where users.id = $1`,
    [userId]
  );
  const preferences = settings.rows[0]?.preferences ?? {};
  const standardHours = boundedNumber(preferences.sessionDurationHours, defaultSessionHours, 1, 24 * 30);
  const rememberDays = boundedNumber(preferences.rememberMeDurationDays, defaultRememberMeDays, 1, 365);
  const durationMs = rememberMe ? rememberDays * 24 * 60 * 60 * 1000 : standardHours * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + durationMs);

  await db.query(
    "insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );

  reply.setCookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: "/",
    expires: expiresAt
  });
}

export async function clearSession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[cookieName];
  if (token) {
    await db.query("delete from sessions where token_hash = $1", [hashToken(token)]).catch(() => undefined);
  }

  reply.clearCookie(cookieName, { path: "/" });
}

export async function getSessionUser(request: FastifyRequest) {
  const token = request.cookies[cookieName];
  if (!token) return null;

  const result = await db.query(
    `select users.id,
            users.homestead_id,
            users.email,
            users.display_name,
            users.role,
            users.mfa_enabled_at is not null as mfa_enabled
       from sessions
       join users on users.id = sessions.user_id
      where sessions.token_hash = $1
        and sessions.expires_at > now()
        and users.disabled_at is null`,
    [hashToken(token)]
  );

  return result.rows[0] ?? null;
}
