import { createHash, createHmac, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import { clearSession, createSession, getSessionUser } from "../services/sessions.js";

const bootstrapSchema = z.object({
  homesteadName: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(12)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().optional()
});

const resetRequestSchema = z.object({
  email: z.string().email()
});

const resetCompleteSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(12)
});

const roleSchema = z.enum(["OWNER", "KEEPER", "VIEWER"]);

const createUserSchema = z.object({
  displayName: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(12),
  role: roleSchema
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  password: z.string().min(12).optional(),
  role: roleSchema.optional(),
  disabled: z.boolean().optional()
});

const userParamsSchema = z.object({
  id: z.string().uuid()
});

const mfaCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function hashResetToken(token: string) {
  return createHash("sha256").update(`${token}.${env.SESSION_SECRET}`).digest("hex");
}

function base32Encode(bytes: Buffer) {
  let bits = "";
  let output = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += base32Alphabet[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(secret: string) {
  const clean = secret.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = "";
  for (const char of clean) {
    const value = base32Alphabet.indexOf(char);
    if (value === -1) throw new Error("Invalid MFA secret.");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret: string | null, code: string | undefined) {
  if (!secret || !code || !/^\d{6}$/.test(code)) return false;
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  return [-1, 0, 1].some((offset) => totpCode(secret, currentStep + offset) === code);
}

async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role !== "OWNER") {
    reply.code(403).send({ message: "Only owners can manage users." });
    return null;
  }
  return user;
}

async function activeOwnerCount(homesteadId: string) {
  const result = await db.query(
    `select count(*)::int as count
       from users
      where homestead_id = $1
        and role = 'OWNER'
        and disabled_at is null`,
    [homesteadId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/bootstrap", async () => {
    const result = await db.query("select exists(select 1 from users) as has_users");
    return { needsOwnerAccount: !result.rows[0]?.has_users };
  });

  app.post("/auth/register", async (request, reply) => {
    const input = bootstrapSchema.parse(request.body);
    const client = await db.connect();

    try {
      await client.query("begin");
      const existingUsers = await client.query("select exists(select 1 from users) as has_users");
      if (existingUsers.rows[0]?.has_users) {
        await client.query("rollback");
        return reply.code(409).send({ message: "This Covey install already has an owner. Sign in or ask an owner to invite you." });
      }

      const homestead = await client.query(
        "insert into homesteads (name) values ($1) returning id",
        [input.homesteadName]
      );

      await client.query(
        "insert into homestead_settings (homestead_id, preferences) values ($1, $2)",
        [
          homestead.rows[0].id,
          {
            feedTopOffUnit: "cup",
            incubationDays: 20,
            candleDay: 7,
            lockdownDay: 14
          }
        ]
      );

      const user = await client.query(
        `insert into users (homestead_id, email, display_name, role, password_hash)
         values ($1, $2, $3, 'OWNER', $4)
         returning id, homestead_id, email, display_name, role, mfa_enabled_at is not null as mfa_enabled`,
        [
          homestead.rows[0].id,
          input.email.toLowerCase(),
          input.displayName,
          await hashPassword(input.password)
        ]
      );

      await client.query("commit");
      await createSession(reply, user.rows[0].id);
      return { user: user.rows[0] };
    } catch (error: unknown) {
      await client.query("rollback");
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return reply.code(409).send({ message: "An account with that email already exists." });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await db.query(
      `select id,
              homestead_id,
              email,
              display_name,
              role,
              password_hash,
              mfa_secret,
              mfa_enabled_at,
              mfa_enabled_at is not null as mfa_enabled
         from users
        where lower(email) = lower($1)
          and disabled_at is null`,
      [input.email]
    );
    const user = result.rows[0];

    if (!user || !(await verifyPassword(user.password_hash, input.password))) {
      return reply.code(401).send({ message: "Invalid email or password." });
    }

    if (user.mfa_enabled_at && !verifyTotp(user.mfa_secret, input.mfaCode)) {
      return { mfaRequired: true };
    }

    await createSession(reply, user.id);
    delete user.password_hash;
    delete user.mfa_secret;
    delete user.mfa_enabled_at;
    return { user };
  });

  app.post("/auth/password-reset/request", async (request) => {
    const input = resetRequestSchema.parse(request.body);
    const result = await db.query(
      `select id
         from users
        where lower(email) = lower($1)
          and disabled_at is null`,
      [input.email]
    );
    const user = result.rows[0];
    if (!user) {
      return {
        ok: true,
        message: "If that email exists, a password reset will be available."
      };
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.query(
      `insert into password_reset_tokens (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [user.id, hashResetToken(token), expiresAt]
    );

    return {
      ok: true,
      message: "Password reset token created. Email delivery can be wired in later.",
      resetToken: token,
      resetUrl: `/reset-password?token=${encodeURIComponent(token)}`,
      expiresAt
    };
  });

  app.post("/auth/password-reset/complete", async (request, reply) => {
    const input = resetCompleteSchema.parse(request.body);
    const tokenHash = hashResetToken(input.token);
    const client = await db.connect();

    try {
      await client.query("begin");
      const tokenResult = await client.query(
        `select password_reset_tokens.id, password_reset_tokens.user_id
           from password_reset_tokens
           join users on users.id = password_reset_tokens.user_id
          where password_reset_tokens.token_hash = $1
            and password_reset_tokens.used_at is null
            and password_reset_tokens.expires_at > now()
            and users.disabled_at is null
          for update`,
        [tokenHash]
      );
      const token = tokenResult.rows[0];
      if (!token) {
        await client.query("rollback");
        return reply.code(400).send({ message: "Reset token is invalid or expired." });
      }

      await client.query(
        `update users
            set password_hash = $2,
                updated_at = now()
          where id = $1`,
        [token.user_id, await hashPassword(input.password)]
      );
      await client.query("update password_reset_tokens set used_at = now() where id = $1", [token.id]);
      await client.query("delete from sessions where user_id = $1", [token.user_id]);
      await client.query("commit");

      return { ok: true };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    await clearSession(request, reply);
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    return { user };
  });

  app.post("/auth/mfa/setup", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    if (user.mfa_enabled) return reply.code(400).send({ message: "MFA is already enabled." });

    const secret = base32Encode(randomBytes(20));
    await db.query(
      `update users
          set mfa_secret = $2,
              mfa_enabled_at = null,
              updated_at = now()
        where id = $1`,
      [user.id, secret]
    );

    const issuer = "Covey";
    const label = `${issuer}:${user.email}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    return { secret, otpauthUrl };
  });

  app.post("/auth/mfa/enable", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const input = mfaCodeSchema.parse(request.body);
    const result = await db.query("select mfa_secret from users where id = $1 and disabled_at is null", [user.id]);
    const secret = result.rows[0]?.mfa_secret ?? null;
    if (!verifyTotp(secret, input.code)) {
      return reply.code(400).send({ message: "Authenticator code did not match." });
    }

    const updated = await db.query(
      `update users
          set mfa_enabled_at = now(),
              updated_at = now()
        where id = $1
        returning id, homestead_id, email, display_name, role, mfa_enabled_at is not null as mfa_enabled`,
      [user.id]
    );

    return { user: updated.rows[0] };
  });

  app.post("/auth/mfa/disable", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const input = mfaCodeSchema.parse(request.body);
    const result = await db.query("select mfa_secret, mfa_enabled_at from users where id = $1 and disabled_at is null", [
      user.id
    ]);
    const current = result.rows[0];
    if (current?.mfa_enabled_at && !verifyTotp(current.mfa_secret, input.code)) {
      return reply.code(400).send({ message: "Authenticator code did not match." });
    }

    const updated = await db.query(
      `update users
          set mfa_secret = null,
              mfa_enabled_at = null,
              updated_at = now()
        where id = $1
        returning id, homestead_id, email, display_name, role, mfa_enabled_at is not null as mfa_enabled`,
      [user.id]
    );

    return { user: updated.rows[0] };
  });

  app.get("/auth/users", async (request, reply) => {
    const owner = await requireOwner(request, reply);
    if (!owner) return;

    const result = await db.query(
      `select id,
              homestead_id,
              email,
              display_name,
              role,
              mfa_enabled_at is not null as mfa_enabled,
              disabled_at,
              created_at,
              updated_at
         from users
        where homestead_id = $1
        order by disabled_at nulls first, role, lower(display_name)`,
      [owner.homestead_id]
    );

    return { users: result.rows };
  });

  app.post("/auth/users", async (request, reply) => {
    const owner = await requireOwner(request, reply);
    if (!owner) return;

    const input = createUserSchema.parse(request.body);
    try {
      const result = await db.query(
        `insert into users (homestead_id, email, display_name, role, password_hash)
         values ($1, $2, $3, $4, $5)
         returning id, homestead_id, email, display_name, role, mfa_enabled_at is not null as mfa_enabled, disabled_at, created_at, updated_at`,
        [
          owner.homestead_id,
          input.email.toLowerCase(),
          input.displayName,
          input.role,
          await hashPassword(input.password)
        ]
      );

      return { user: result.rows[0] };
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return reply.code(409).send({ message: "An account with that email already exists." });
      }
      throw error;
    }
  });

  app.patch("/auth/users/:id", async (request, reply) => {
    const owner = await requireOwner(request, reply);
    if (!owner) return;

    const params = userParamsSchema.parse(request.params);
    const input = updateUserSchema.parse(request.body);
    const current = await db.query(
      `select id, homestead_id, role, disabled_at
         from users
        where id = $1
          and homestead_id = $2`,
      [params.id, owner.homestead_id]
    );
    const target = current.rows[0];
    if (!target) return reply.code(404).send({ message: "User not found." });

    const disabling = input.disabled === true && !target.disabled_at;
    const demotingOwner = target.role === "OWNER" && input.role && input.role !== "OWNER";
    if (params.id === owner.id && (disabling || demotingOwner)) {
      return reply.code(400).send({ message: "You cannot remove your own owner access." });
    }
    if ((disabling || demotingOwner) && target.role === "OWNER" && (await activeOwnerCount(owner.homestead_id)) <= 1) {
      return reply.code(400).send({ message: "Add another active owner before changing this owner." });
    }

    const result = await db.query(
      `update users
          set display_name = coalesce($3, display_name),
              role = coalesce($4, role),
              password_hash = coalesce($5, password_hash),
              disabled_at = case
                when $6::boolean is null then disabled_at
                when $6::boolean then coalesce(disabled_at, now())
                else null
              end,
              updated_at = now()
        where id = $1
          and homestead_id = $2
        returning id, homestead_id, email, display_name, role, mfa_enabled_at is not null as mfa_enabled, disabled_at, created_at, updated_at`,
      [
        params.id,
        owner.homestead_id,
        input.displayName ?? null,
        input.role ?? null,
        input.password ? await hashPassword(input.password) : null,
        input.disabled ?? null
      ]
    );

    if (input.disabled === true) {
      await db.query("delete from sessions where user_id = $1", [params.id]);
    }

    return { user: result.rows[0] };
  });

  app.delete("/auth/users/:id", async (request, reply) => {
    const owner = await requireOwner(request, reply);
    if (!owner) return;

    const params = userParamsSchema.parse(request.params);
    if (params.id === owner.id) {
      return reply.code(400).send({ message: "You cannot disable your own account." });
    }

    const current = await db.query(
      `select id, role, disabled_at
         from users
        where id = $1
          and homestead_id = $2`,
      [params.id, owner.homestead_id]
    );
    const target = current.rows[0];
    if (!target) return reply.code(404).send({ message: "User not found." });
    if (target.role === "OWNER" && !target.disabled_at && (await activeOwnerCount(owner.homestead_id)) <= 1) {
      return reply.code(400).send({ message: "Add another active owner before disabling this owner." });
    }

    await db.query(
      `update users
          set disabled_at = coalesce(disabled_at, now()),
              updated_at = now()
        where id = $1
          and homestead_id = $2`,
      [params.id, owner.homestead_id]
    );
    await db.query("delete from sessions where user_id = $1", [params.id]);

    return { ok: true };
  });
}
