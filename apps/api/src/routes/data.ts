import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const exportedTables = [
  "coops",
  "breeding_lines",
  "hatch_batches",
  "birds",
  "mating_periods",
  "incubations",
  "feed_types",
  "feed_inventory_events",
  "feed_logs",
  "egg_logs",
  "weight_logs",
  "sales",
  "bird_health_events"
] as const;

const importSections = [
  ["Coops", "coops", ["coops"]],
  ["Birds", "birds", ["birds"]],
  ["Breeding lines", "breeding_lines", ["breeding_lines", "breedingLines"]],
  ["Mating periods", "mating_periods", ["mating_periods", "matingPeriods", "penMatingPeriods"]],
  ["Hen group links", "mating_period_hens", ["mating_period_hens", "matingPeriodHens", "henGroups"]],
  ["Incubations", "incubations", ["incubations", "incubationCycles"]],
  ["Hatch batches", "hatch_batches", ["hatch_batches", "hatchBatches"]],
  ["Feed catalog", "feed_types", ["feed_types", "feedTypes", "feeds"]],
  ["Feed restocks", "feed_inventory_events", ["feed_inventory_events", "feedInventoryEvents", "feedRestocks"]],
  ["Feed top-offs", "feed_logs", ["feed_logs", "feedLogs", "feedTopOffs"]],
  ["Egg logs", "egg_logs", ["egg_logs", "eggLogs"]],
  ["Weight logs", "weight_logs", ["weight_logs", "weightLogs"]],
  ["Sales", "sales", ["sales", "saleRecords"]],
  ["Health records", "bird_health_events", ["bird_health_events", "healthEvents", "healthRecords"]]
] as const;

const importBodySchema = z.object({
  data: z.unknown(),
  options: z.object({
    applySettings: z.boolean().optional(),
    scope: z.string().optional(),
    conflictMode: z.enum(["skip", "replace"]).optional(),
    confirmReplace: z.string().optional()
  }).optional()
});

const bundleImportBodySchema = z.object({
  fileName: z.string().optional(),
  dataUrl: z.string().min(1),
  options: z.object({
    applySettings: z.boolean().optional(),
    scope: z.string().optional(),
    conflictMode: z.enum(["skip", "replace"]).optional(),
    confirmReplace: z.string().optional()
  }).optional()
});

const backupSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  dayOfWeek: z.number().int().min(0).max(6).default(1),
  dayOfMonth: z.number().int().min(1).max(28).default(1),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).default("02:00"),
  retentionCount: z.number().int().min(1).max(100).default(12)
});

const backupParamsSchema = z.object({
  id: z.string().uuid()
});

const allowedCoopTypes = new Set(["BREEDING", "GROW_OUT", "BROODER", "HOSPITAL", "OTHER"]);
const allowedSexes = new Set(["MALE", "FEMALE", "UNKNOWN"]);
const allowedStatuses = new Set(["ACTIVE", "PROCESSED", "SOLD", "DIED", "RETIRED", "CULLED"]);
const allowedFeedLogUnits = new Set(["cup", "lb", "oz"]);
const allowedInventoryUnits = new Set(["bag", "cup", "lb", "oz"]);
const allowedSaleItemTypes = new Set(["TABLE_EGGS", "FERTILE_EGGS", "CHICKS", "BIRDS", "MEAT", "OTHER"]);
const allowedHealthEventTypes = new Set(["HEALTH", "INJURY", "TREATMENT", "QUARANTINE", "BEHAVIOR", "MORTALITY", "OTHER"]);
const allowedHealthSeverities = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const allowedHealthOutcomes = new Set(["OPEN", "MONITORING", "RESOLVED", "CULLED", "DIED"]);
const restoreScopes = ["all", "settings", "coops", "birds", "breeding", "incubation", "eggs", "feed", "sales", "health", "photos"] as const;
const importSectionKeys = importSections.map(([, key]) => key);
const scopeSections: Record<(typeof restoreScopes)[number], ImportSectionKey[]> = {
  all: [...importSectionKeys],
  settings: [],
  coops: ["coops"],
  birds: ["birds", "weight_logs"],
  breeding: ["breeding_lines", "mating_periods", "mating_period_hens"],
  incubation: ["hatch_batches", "incubations"],
  eggs: ["egg_logs"],
  feed: ["feed_types", "feed_inventory_events", "feed_logs"],
  sales: ["sales"],
  health: ["bird_health_events"],
  photos: []
};

type ExportRecord = Record<string, unknown>;
type ExportedTable = (typeof exportedTables)[number];
type ImportSectionKey = (typeof importSections)[number][1];
type ImportRecords = Record<ImportSectionKey, ExportRecord[]>;
type ImportIssue = { severity: "warning" | "error"; message: string };
type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
type BackupTrigger = "MANUAL" | "SCHEDULED";
type RestoreScope = (typeof restoreScopes)[number];
type ConflictMode = "skip" | "replace";
type RestoreOptions = {
  applySettings: boolean;
  scope: RestoreScope;
  conflictMode: ConflictMode;
  confirmReplace: string;
};
type Queryable = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};
type IdMaps = {
  coops: Map<string, string>;
  breeding_lines: Map<string, string>;
  hatch_batches: Map<string, string>;
  birds: Map<string, string>;
  mating_periods: Map<string, string>;
  incubations: Map<string, string>;
  feed_types: Map<string, string>;
  health_events: Map<string, string>;
};
type ZipEntryInput = { path: string; data: Buffer | string };

async function homesteadRows(table: ExportedTable, homesteadId: string) {
  const result = await db.query(`select * from ${table} where homestead_id = $1 order by created_at asc`, [homesteadId]);
  return result.rows as ExportRecord[];
}

function safeExportName(name: unknown) {
  return String(name ?? "covey")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "covey";
}

function safeFileBase(fileName: string) {
  const parsed = basename(fileName, extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return parsed || "photo";
}

function safeZipPath(path: string) {
  return path
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[^a-zA-Z0-9._-]+/g, "-"))
    .join("/");
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDateParts(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function createZip(entries: ZipEntryInput[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const { dosTime, dosDate } = zipDateParts();

  for (const entry of entries) {
    const path = safeZipPath(entry.path);
    const name = Buffer.from(path, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function readZip(buffer: Buffer) {
  const entries = new Map<string, Buffer>();
  let offset = 0;

  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    if (method !== 0) throw new Error("This backup bundle uses compression this version cannot restore.");
    if (flags & 0x0008) throw new Error("This backup bundle uses a ZIP data descriptor this version cannot restore.");

    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error("Backup bundle appears to be incomplete.");
    const path = safeZipPath(buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8"));
    const data = buffer.subarray(dataStart, dataEnd);
    if (data.length !== uncompressedSize) throw new Error(`Backup bundle entry "${path}" has an invalid size.`);
    entries.set(path, Buffer.from(data));
    offset = dataEnd;
  }

  return entries;
}

function dataUrlToBuffer(dataUrl: string) {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) throw new Error("Backup bundle upload was not valid.");
  return Buffer.from(match[1], "base64");
}

async function buildHomesteadExport(
  homesteadId: string,
  exportedBy:
    | {
        id: string | null;
        email: string;
        display_name: string;
        role: string;
      }
    | null
) {
  const homesteadResult = await db.query(
    `select homesteads.id,
            homesteads.name,
            homesteads.profile,
            homesteads.created_at,
            homesteads.updated_at,
            coalesce(homestead_settings.preferences, '{}'::jsonb) as preferences
       from homesteads
       left join homestead_settings on homestead_settings.homestead_id = homesteads.id
      where homesteads.id = $1`,
    [homesteadId]
  );

  const usersResult = await db.query(
    `select id, email, display_name, role, mfa_enabled_at is not null as mfa_enabled, disabled_at, created_at, updated_at
       from users
      where homestead_id = $1
      order by created_at asc`,
    [homesteadId]
  );

  const henResult = await db.query(
    `select hens.mating_period_id, hens.hen_id, hens.joined_on, hens.left_on
       from mating_period_hens hens
       join mating_periods periods on periods.id = hens.mating_period_id
      where periods.homestead_id = $1
      order by hens.joined_on asc`,
    [homesteadId]
  );

  const tableEntries = await Promise.all(
    exportedTables.map(async (table) => [table, await homesteadRows(table, homesteadId)] as const)
  );
  const records = Object.fromEntries(tableEntries) as Record<ExportedTable, ExportRecord[]>;

  if (records.coops) {
    records.coops = records.coops.map(({ camera_rtsp_url: cameraRtspUrl, ...coop }: ExportRecord) => ({
      ...coop,
      has_camera: Boolean(cameraRtspUrl)
    }));
  }

  const exportedAt = new Date();
  const homestead = homesteadResult.rows[0];

  return {
    filenameBase: safeExportName(homestead?.name),
    payload: {
      format: "covey.homestead-export.v1",
      exported_at: exportedAt.toISOString(),
      exported_by: exportedBy ?? {
        id: null,
        email: "system",
        display_name: "Covey backup scheduler",
        role: "SYSTEM"
      },
      security_note:
        "Passwords, sessions, MFA secrets, reset tokens, raw RTSP camera URLs, audit history, backup run history, and uploaded photo files are not included.",
      export_coverage: {
        included: [
          "homestead profile and settings",
          "sanitized user list",
          "coops without raw camera URLs",
          "breeding lines",
          "mating periods and hen group links",
          "incubations",
          "hatch batches",
          "birds",
          "egg logs",
          "weight logs",
          "feed catalog",
          "feed inventory/restocks",
          "feed top-offs",
          "sales",
          "health records"
        ],
        excluded: [
          "password hashes",
          "sessions",
          "MFA secrets",
          "password reset tokens",
          "raw RTSP camera URLs",
          "uploaded photo files",
          "audit history",
          "backup run history"
        ],
        transfer_note:
          "Use this JSON for portable homestead records. For a complete server move with photos, also restore the Postgres database backup and the upload volume."
      },
      homestead,
      users: usersResult.rows,
      records: {
        ...records,
        mating_period_hens: henResult.rows
      }
    }
  };
}

async function buildHomesteadBundle(
  homesteadId: string,
  exportedBy: {
    id: string | null;
    email: string;
    display_name: string;
    role: string;
  },
  includePhotos: boolean
) {
  const exported = await buildHomesteadExport(homesteadId, exportedBy);
  const payload = JSON.parse(JSON.stringify(exported.payload)) as ExportRecord;
  const entries: ZipEntryInput[] = [];
  const bundledPhotos: ExportRecord[] = [];
  let missingPhotoFiles = 0;

  if (includePhotos) {
    const photoResult = await db.query(
      `select id, entity_type, entity_id, file_name, mime_type, storage_path, byte_size, caption, created_at
         from photo_attachments
        where homestead_id = $1
        order by created_at asc`,
      [homesteadId]
    );

    for (const photo of photoResult.rows as ExportRecord[]) {
      const storagePath = text(photo, "storage_path");
      const fileInfo = storagePath ? await stat(storagePath).catch(() => null) : null;
      if (!storagePath || !fileInfo) {
        missingPhotoFiles += 1;
        continue;
      }
      const extension = extname(text(photo, "file_name")) || ".img";
      const bundlePath = safeZipPath(
        `photos/${String(photo.entity_type ?? "photo").toLowerCase()}/${text(photo, "id")}-${safeFileBase(text(photo, "file_name"))}${extension}`
      );
      entries.push({ path: bundlePath, data: await readFile(storagePath) });
      const { storage_path: _storagePath, ...safePhoto } = photo;
      bundledPhotos.push({ ...safePhoto, bundle_path: bundlePath });
    }
  }

  payload.format = "covey.backup-bundle.v1";
  payload.photo_attachments = bundledPhotos;
  payload.export_coverage = {
    ...(asRecord(payload.export_coverage) as ExportRecord),
    included: [
      ...new Set([
        ...((asRecord(payload.export_coverage).included as string[] | undefined) ?? []),
        includePhotos ? "uploaded photo files" : "photo metadata"
      ])
    ],
    excluded: ((asRecord(payload.export_coverage).excluded as string[] | undefined) ?? []).filter((item) =>
      includePhotos ? item !== "uploaded photo files" : true
    ),
    transfer_note:
      includePhotos
        ? "This bundle contains portable homestead records and uploaded photos. Use a Postgres dump for full disaster recovery."
        : "This bundle contains portable homestead records without uploaded photo files. Use a Postgres dump plus upload volume archive for full disaster recovery."
  };

  const manifest = {
    format: "covey.backup-bundle.v1",
    created_at: new Date().toISOString(),
    includes: {
      records: true,
      photos: includePhotos,
      raw_camera_urls: false,
      database_dump: false,
      secrets: false
    },
    counts: {
      photos: bundledPhotos.length,
      missing_photo_files: missingPhotoFiles
    },
    restore_note:
      "Restore this bundle from Settings > Data. It imports records and reattaches included photos to newly imported records."
  };

  entries.unshift(
    { path: "manifest.json", data: JSON.stringify(manifest, null, 2) },
    { path: "data.json", data: JSON.stringify(payload, null, 2) }
  );

  return {
    filenameBase: exported.filenameBase,
    zip: createZip(entries),
    manifest
  };
}

function backupSettings(preferences: ExportRecord) {
  const raw = asRecord(preferences.backupSchedule);
  const timeOfDay = typeof raw.timeOfDay === "string" && /^\d{2}:\d{2}$/.test(raw.timeOfDay) ? raw.timeOfDay : "02:00";
  const rawDayOfWeek = Number(raw.dayOfWeek ?? 1);
  const rawDayOfMonth = Number(raw.dayOfMonth ?? 1);
  const dayOfWeek = Number.isFinite(rawDayOfWeek) ? Math.min(6, Math.max(0, rawDayOfWeek)) : 1;
  const dayOfMonth = Number.isFinite(rawDayOfMonth) ? Math.min(28, Math.max(1, rawDayOfMonth)) : 1;
  return backupSettingsSchema.parse({
    enabled: raw.enabled === true,
    frequency: typeof raw.frequency === "string" ? raw.frequency : "weekly",
    dayOfWeek,
    dayOfMonth,
    timeOfDay,
    retentionCount: Number(raw.retentionCount ?? 12)
  });
}

function applyBackupTime(date: Date, timeOfDay: string) {
  const [hours = "2", minutes = "0"] = timeOfDay.split(":");
  date.setUTCHours(Number(hours), Number(minutes), 0, 0);
}

function nextBackupDueAt(lastCompletedAt: string | null, settings: z.infer<typeof backupSettingsSchema>) {
  const now = new Date();
  const base = lastCompletedAt ? new Date(lastCompletedAt) : now;
  const due = new Date(base);
  applyBackupTime(due, settings.timeOfDay);

  if (settings.frequency === "daily") {
    if (lastCompletedAt || due.getTime() <= now.getTime()) due.setUTCDate(due.getUTCDate() + 1);
    return due;
  }

  if (settings.frequency === "weekly") {
    const daysUntil = (settings.dayOfWeek - due.getUTCDay() + 7) % 7;
    due.setUTCDate(due.getUTCDate() + daysUntil);
    if (lastCompletedAt || due.getTime() <= now.getTime()) due.setUTCDate(due.getUTCDate() + 7);
    return due;
  }

  due.setUTCDate(Math.min(settings.dayOfMonth, 28));
  if (lastCompletedAt || due.getTime() <= now.getTime()) due.setUTCMonth(due.getUTCMonth() + 1);
  due.setUTCDate(Math.min(settings.dayOfMonth, 28));
  return due;
}

async function pruneBackups(homesteadId: string, retentionCount: number) {
  const oldBackups = await db.query(
    `select id, file_path
       from backup_runs
      where id in (
        select id
          from backup_runs
        where homestead_id = $1
          and status = 'SUCCESS'
        order by completed_at desc
        offset $2
      )`,
    [homesteadId, retentionCount]
  );
  await Promise.all(oldBackups.rows.map((row) => (row.file_path ? unlink(row.file_path).catch(() => undefined) : undefined)));
  if (oldBackups.rows.length) {
    await db.query("delete from backup_runs where id = any($1::uuid[])", [oldBackups.rows.map((row) => row.id)]);
  }
}

async function createBackupRun(homesteadId: string, triggerType: BackupTrigger) {
  const exported = await buildHomesteadExport(homesteadId, null);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${exported.filenameBase}-backup-${timestamp}.json`;
  const filePath = join(env.BACKUP_DIR, homesteadId, fileName);

  try {
    await mkdir(join(env.BACKUP_DIR, homesteadId), { recursive: true });
    const content = JSON.stringify(exported.payload, null, 2);
    await writeFile(filePath, content, "utf8");
    const result = await db.query(
      `insert into backup_runs (homestead_id, status, trigger_type, file_name, file_path, byte_size)
       values ($1, 'SUCCESS', $2, $3, $4, $5)
       returning id, status, trigger_type, file_name, byte_size, error_message, created_at, completed_at`,
      [homesteadId, triggerType, fileName, filePath, Buffer.byteLength(content)]
    );
    const settingsResult = await db.query("select preferences from homestead_settings where homestead_id = $1", [homesteadId]);
    const settings = backupSettings((settingsResult.rows[0]?.preferences ?? {}) as ExportRecord);
    await pruneBackups(homesteadId, settings.retentionCount);
    return result.rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backup failed.";
    const result = await db.query(
      `insert into backup_runs (homestead_id, status, trigger_type, error_message)
       values ($1, 'FAILED', $2, $3)
       returning id, status, trigger_type, file_name, byte_size, error_message, created_at, completed_at`,
      [homesteadId, triggerType, message]
    );
    throw Object.assign(new Error(message), { backupRun: result.rows[0] });
  }
}

async function backupStatus(homesteadId: string) {
  const settingsResult = await db.query("select preferences from homestead_settings where homestead_id = $1", [homesteadId]);
  const settings = backupSettings((settingsResult.rows[0]?.preferences ?? {}) as ExportRecord);
  const historyResult = await db.query(
    `select id, status, trigger_type, file_name, byte_size, error_message, created_at, completed_at
       from backup_runs
      where homestead_id = $1
      order by completed_at desc
      limit 20`,
    [homesteadId]
  );
  const lastSuccess = historyResult.rows.find((row) => row.status === "SUCCESS") ?? null;
  const nextDueAt = settings.enabled ? nextBackupDueAt(lastSuccess?.completed_at ?? null, settings).toISOString() : null;
  return { settings, lastSuccess, nextDueAt, history: historyResult.rows };
}

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change homestead records." });
    return null;
  }
  return user;
}

function asRecord(value: unknown): ExportRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ExportRecord) : {};
}

function asRecordArray(value: unknown): ExportRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is ExportRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function firstRecordArray(source: ExportRecord, keys: readonly string[]) {
  for (const key of keys) {
    const records = asRecordArray(source[key]);
    if (records.length) return records;
  }
  return [];
}

function text(record: ExportRecord, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function textAny(record: ExportRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = text(record, key);
    if (value) return value;
  }
  return "";
}

function nullableText(record: ExportRecord, keys: readonly string[]) {
  const value = textAny(record, keys);
  return value || null;
}

function numberAny(record: ExportRecord, keys: readonly string[], fallback: number | null = null) {
  for (const key of keys) {
    const value = record[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function integerAny(record: ExportRecord, keys: readonly string[], fallback = 0) {
  const value = numberAny(record, keys, null);
  return value === null ? fallback : Math.max(0, Math.round(value));
}

function boolAny(record: ExportRecord, keys: readonly string[], fallback = false) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (["true", "yes", "1"].includes(value.toLowerCase())) return true;
      if (["false", "no", "0"].includes(value.toLowerCase())) return false;
    }
  }
  return fallback;
}

function dateAny(record: ExportRecord, keys: readonly string[]) {
  const value = textAny(record, keys);
  if (!value) return null;
  return value.slice(0, 10);
}

function datetimeAny(record: ExportRecord, keys: readonly string[]) {
  const value = textAny(record, keys);
  return value || null;
}

function upperAny(record: ExportRecord, keys: readonly string[], fallback: string) {
  return (textAny(record, keys) || fallback).toUpperCase();
}

function lower(value: string) {
  return value.trim().toLowerCase();
}

function restoreOptions(options: z.infer<typeof importBodySchema>["options"] | z.infer<typeof bundleImportBodySchema>["options"]): RestoreOptions {
  const rawScope = options?.scope;
  const scope = restoreScopes.includes(rawScope as RestoreScope) ? (rawScope as RestoreScope) : "all";
  return {
    applySettings: options?.applySettings ?? (scope === "all" || scope === "settings"),
    scope,
    conflictMode: options?.conflictMode ?? "skip",
    confirmReplace: options?.confirmReplace ?? ""
  };
}

function scopedRecords(records: ImportRecords, scope: RestoreScope) {
  const allowed = new Set(scopeSections[scope]);
  return Object.fromEntries(
    importSections.map(([, key]) => [key, allowed.has(key) ? records[key] : []])
  ) as ImportRecords;
}

function recordNaturalKey(section: ImportSectionKey, record: ExportRecord) {
  if (section === "coops") return lower(text(record, "name"));
  if (section === "breeding_lines") return lower(text(record, "name"));
  if (section === "hatch_batches") return lower(text(record, "label"));
  if (section === "incubations") return lower(text(record, "label"));
  if (section === "birds") {
    const band = text(record, "band");
    if (band) return `band:${lower(band)}`;
    const name = text(record, "name");
    return name ? `name:${lower(name)}` : "";
  }
  if (section === "feed_types") return `${lower(text(record, "brand"))}|${lower(text(record, "name"))}`;
  return "";
}

function filterExisting(records: ImportRecords, existingKeys: Map<ImportSectionKey, Set<string>>, maps: IdMaps) {
  const skipped: Record<string, number> = {};
  const next = Object.fromEntries(importSections.map(([, key]) => [key, records[key]])) as ImportRecords;
  for (const section of ["coops", "breeding_lines", "hatch_batches", "incubations", "birds", "feed_types"] as const) {
    next[section] = records[section].filter((record) => {
      const key = recordNaturalKey(section, record);
      if (!key || !existingKeys.get(section)?.has(key)) return true;
      skipped[section] = (skipped[section] ?? 0) + 1;
      return false;
    });
  }
  return { records: next, skipped };
}

function mapRef(record: ExportRecord, keys: readonly string[], ids: Map<string, string>) {
  const sourceId = textAny(record, keys);
  return sourceId ? ids.get(sourceId) ?? null : null;
}

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function importRecords(data: unknown): { root: ExportRecord; records: ImportRecords; format: string } {
  const root = asRecord(data);
  const nestedRecords = asRecord(root.records);
  const source = Object.keys(nestedRecords).length ? nestedRecords : root;
  const records = Object.fromEntries(
    importSections.map(([, key, aliases]) => [key, firstRecordArray(source, aliases)])
  ) as ImportRecords;

  return { root, records, format: text(root, "format") || "unknown" };
}

function knownIds(records: ImportRecords, key: ImportSectionKey) {
  return new Set(records[key].map((record) => text(record, "id")).filter(Boolean));
}

function checkDuplicate(values: string[], label: string, issues: ImportIssue[]) {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = lower(value);
    if (seen.has(normalized)) {
      issues.push({ severity: "error", message: `${label} "${value}" appears more than once in the import file.` });
    }
    seen.add(normalized);
  }
}

async function dashboardTotals(homesteadId: string) {
  const result = await db.query(
    `select
       (select count(*)::int from birds where homestead_id = $1) as birds,
       (select count(*)::int from birds where homestead_id = $1 and status = 'ACTIVE') as active_birds,
       (select count(*)::int from coops where homestead_id = $1) as coops,
       (select count(*)::int from breeding_lines where homestead_id = $1) as breeding_lines,
       (select count(*)::int from mating_periods where homestead_id = $1) as mating_periods,
       (select count(*)::int from hatch_batches where homestead_id = $1) as hatch_batches,
       (select count(*)::int from incubations where homestead_id = $1) as incubations,
       (select count(*)::int from feed_types where homestead_id = $1) as feed_types,
       (select coalesce(sum(quantity), 0)::int from egg_logs where homestead_id = $1) as eggs,
       (select count(*)::int from weight_logs where homestead_id = $1) as weight_logs,
       (select count(*)::int from sales where homestead_id = $1) as sales,
       (select count(*)::int from bird_health_events where homestead_id = $1) as health_records`,
    [homesteadId]
  );
  return result.rows[0] as Record<string, number>;
}

const poolQueryable: Queryable = {
  query: (sql, values) => db.query(sql, values as any[] | undefined)
};

function clientQueryable(client: PoolClient): Queryable {
  return {
    query: (sql, values) => client.query(sql, values as any[] | undefined)
  };
}

async function existingRestoreState(homesteadId: string, records: ImportRecords, queryable: Queryable = poolQueryable) {
  const maps: IdMaps = {
    coops: new Map<string, string>(),
    breeding_lines: new Map<string, string>(),
    hatch_batches: new Map<string, string>(),
    birds: new Map<string, string>(),
    mating_periods: new Map<string, string>(),
    incubations: new Map<string, string>(),
    feed_types: new Map<string, string>(),
    health_events: new Map<string, string>()
  };
  const keys = new Map<ImportSectionKey, Set<string>>(importSections.map(([, key]) => [key, new Set<string>()]));

  async function seed(section: ImportSectionKey, sql: string, map: Map<string, string>, keyFor: (row: ExportRecord) => string) {
    const result = await queryable.query(sql, [homesteadId]);
    for (const row of result.rows as ExportRecord[]) {
      const key = keyFor(row);
      if (!key) continue;
      keys.get(section)?.add(key);
      const matching = records[section].filter((record) => recordNaturalKey(section, record) === key);
      for (const record of matching) if (text(record, "id")) map.set(text(record, "id"), text(row, "id"));
    }
  }

  await seed("coops", "select id, name from coops where homestead_id = $1", maps.coops, (row) => lower(text(row, "name")));
  await seed("breeding_lines", "select id, name from breeding_lines where homestead_id = $1", maps.breeding_lines, (row) => lower(text(row, "name")));
  await seed("hatch_batches", "select id, label from hatch_batches where homestead_id = $1", maps.hatch_batches, (row) => lower(text(row, "label")));
  await seed("incubations", "select id, label from incubations where homestead_id = $1", maps.incubations, (row) => lower(text(row, "label")));
  await seed(
    "birds",
    "select id, name, band from birds where homestead_id = $1",
    maps.birds,
    (row) => (text(row, "band") ? `band:${lower(text(row, "band"))}` : text(row, "name") ? `name:${lower(text(row, "name"))}` : "")
  );
  await seed(
    "feed_types",
    "select id, brand, name from feed_types where homestead_id = $1",
    maps.feed_types,
    (row) => `${lower(text(row, "brand"))}|${lower(text(row, "name"))}`
  );

  return { maps, keys };
}

async function buildImportPreview(data: unknown, homesteadId: string, fileName = "selected file", options: RestoreOptions = restoreOptions(undefined)) {
  const { root, records, format } = importRecords(data);
  const scoped = scopedRecords(records, options.scope);
  const issues: ImportIssue[] = [];

  if (!Object.keys(root).length) {
    issues.push({ severity: "error", message: "The selected file is not a JSON object." });
  }
  if (!["covey.homestead-export.v1", "covey.backup-bundle.v1"].includes(format)) {
    issues.push({ severity: "warning", message: `Format is "${format}". Covey will still check common prototype/Covey record sections.` });
  }

  const existing = await existingRestoreState(homesteadId, records);
  const coopIds = new Set([...knownIds(records, "coops"), ...existing.maps.coops.keys()]);
  const breedingLineIds = new Set([...knownIds(records, "breeding_lines"), ...existing.maps.breeding_lines.keys()]);
  const birdIds = new Set([...knownIds(records, "birds"), ...existing.maps.birds.keys()]);
  const hatchBatchIds = new Set([...knownIds(records, "hatch_batches"), ...existing.maps.hatch_batches.keys()]);
  const matingPeriodIds = knownIds(records, "mating_periods");
  const feedTypeIds = new Set([...knownIds(records, "feed_types"), ...existing.maps.feed_types.keys()]);

  checkDuplicate(scoped.coops.map((coop) => text(coop, "name")).filter(Boolean), "Coop name", issues);
  checkDuplicate(scoped.breeding_lines.map((line) => text(line, "name")).filter(Boolean), "Breeding line", issues);
  checkDuplicate(scoped.hatch_batches.map((batch) => text(batch, "label")).filter(Boolean), "Hatch batch", issues);
  checkDuplicate(scoped.incubations.map((cycle) => text(cycle, "label")).filter(Boolean), "Incubation", issues);

  for (const coop of scoped.coops) {
    const name = text(coop, "name");
    if (!name) issues.push({ severity: "error", message: "A coop is missing a name." });
    const type = upperAny(coop, ["type"], "OTHER");
    if (!allowedCoopTypes.has(type)) issues.push({ severity: "error", message: `Coop "${name || "unnamed"}" has an unknown type.` });
  }

  for (const line of scoped.breeding_lines) {
    if (!text(line, "name")) issues.push({ severity: "error", message: "A breeding line is missing a name." });
  }

  const activeBands = new Map<string, string>();
  for (const bird of scoped.birds) {
    const label = text(bird, "band") || text(bird, "name") || text(bird, "id") || "unnamed bird";
    const sex = upperAny(bird, ["sex"], "UNKNOWN");
    const status = upperAny(bird, ["status"], "ACTIVE");
    if (!allowedSexes.has(sex)) issues.push({ severity: "error", message: `${label} has an unknown sex.` });
    if (!allowedStatuses.has(status)) issues.push({ severity: "error", message: `${label} has an unknown status.` });
    const coopId = textAny(bird, ["coop_id", "coopId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: `${label} references an unknown coop.` });
    const lineId = textAny(bird, ["breeding_line_id", "breedingLineId"]);
    if (lineId && !breedingLineIds.has(lineId)) issues.push({ severity: "error", message: `${label} references an unknown breeding line.` });
    const hatchBatchId = textAny(bird, ["hatch_batch_id", "hatchBatchId"]);
    if (hatchBatchId && !hatchBatchIds.has(hatchBatchId)) issues.push({ severity: "error", message: `${label} references an unknown hatch batch.` });
    const band = lower(text(bird, "band"));
    if (band && status === "ACTIVE") {
      const first = activeBands.get(band);
      if (first) issues.push({ severity: "error", message: `Active band "${text(bird, "band")}" is duplicated by ${first} and ${label}.` });
      activeBands.set(band, label);
    }
  }

  for (const period of scoped.mating_periods) {
    const label = text(period, "label") || text(period, "id") || "unnamed mating period";
    if (!text(period, "label")) issues.push({ severity: "error", message: "A mating period is missing a label." });
    if (!dateAny(period, ["started_on", "startedOn"])) issues.push({ severity: "error", message: `${label} is missing a start date.` });
    const lineId = textAny(period, ["breeding_line_id", "breedingLineId"]);
    if (!lineId) issues.push({ severity: "error", message: `${label} is missing a breeding line.` });
    if (lineId && !breedingLineIds.has(lineId)) issues.push({ severity: "error", message: `${label} references an unknown breeding line.` });
    const coopId = textAny(period, ["coop_id", "coopId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: `${label} references an unknown coop.` });
    const sireId = textAny(period, ["sire_id", "sireId"]);
    if (sireId && !birdIds.has(sireId)) issues.push({ severity: "error", message: `${label} references an unknown sire.` });
  }

  for (const hen of scoped.mating_period_hens) {
    const periodId = textAny(hen, ["mating_period_id", "matingPeriodId"]);
    const henId = textAny(hen, ["hen_id", "henId", "birdId"]);
    if (!periodId || !matingPeriodIds.has(periodId)) issues.push({ severity: "error", message: "A hen group link references an unknown mating period." });
    if (!henId || !birdIds.has(henId)) issues.push({ severity: "error", message: "A hen group link references an unknown hen." });
    if (!dateAny(hen, ["joined_on", "joinedOn"])) issues.push({ severity: "error", message: "A hen group link is missing a joined date." });
  }

  for (const cycle of scoped.incubations) {
    const label = text(cycle, "label") || text(cycle, "id") || "unnamed incubation";
    if (!text(cycle, "label")) issues.push({ severity: "error", message: "An incubation is missing a label." });
    const periodId = textAny(cycle, ["mating_period_id", "matingPeriodId"]);
    if (periodId && !matingPeriodIds.has(periodId)) issues.push({ severity: "error", message: `${label} references an unknown mating period.` });
    const batchId = textAny(cycle, ["hatch_batch_id", "hatchBatchId"]);
    if (batchId && !hatchBatchIds.has(batchId)) issues.push({ severity: "error", message: `${label} references an unknown hatch batch.` });
    if (!dateAny(cycle, ["set_date", "setDate"])) issues.push({ severity: "error", message: `${label} is missing a set date.` });
  }

  for (const batch of scoped.hatch_batches) {
    const label = text(batch, "label") || text(batch, "id") || "unnamed hatch batch";
    if (!text(batch, "label")) issues.push({ severity: "error", message: "A hatch batch is missing a label." });
    const lineId = textAny(batch, ["breeding_line_id", "breedingLineId"]);
    if (lineId && !breedingLineIds.has(lineId)) issues.push({ severity: "error", message: `${label} references an unknown breeding line.` });
    const periodId = textAny(batch, ["mating_period_id", "matingPeriodId"]);
    if (periodId && !matingPeriodIds.has(periodId)) issues.push({ severity: "error", message: `${label} references an unknown mating period.` });
  }

  for (const feed of scoped.feed_types) {
    const label = [text(feed, "brand"), text(feed, "name")].filter(Boolean).join(" ") || text(feed, "id") || "unnamed feed";
    if (!text(feed, "brand")) issues.push({ severity: "error", message: `${label} is missing a brand.` });
    if (!text(feed, "name")) issues.push({ severity: "error", message: `${label} is missing a feed name.` });
    if (!numberAny(feed, ["bag_weight_lb", "bagWeightLb"], null)) issues.push({ severity: "error", message: `${label} is missing bag weight.` });
    if (numberAny(feed, ["bag_cost", "bagCost"], null) === null) issues.push({ severity: "error", message: `${label} is missing bag cost.` });
  }

  for (const log of scoped.feed_inventory_events) {
    const feedTypeId = textAny(log, ["feed_type_id", "feedTypeId"]);
    const unit = text(log, "unit") || "bag";
    if (!feedTypeId || !feedTypeIds.has(feedTypeId)) issues.push({ severity: "error", message: "A feed restock references an unknown feed type." });
    if (!allowedInventoryUnits.has(unit)) issues.push({ severity: "error", message: "A feed restock has an unknown unit." });
  }

  for (const log of scoped.feed_logs) {
    const feedTypeId = textAny(log, ["feed_type_id", "feedTypeId"]);
    const coopId = textAny(log, ["coop_id", "coopId"]);
    const unit = text(log, "unit") || "cup";
    if (!feedTypeId || !feedTypeIds.has(feedTypeId)) issues.push({ severity: "error", message: "A feed top-off references an unknown feed type." });
    if (!coopId || !coopIds.has(coopId)) issues.push({ severity: "error", message: "A feed top-off references an unknown coop." });
    if (!allowedFeedLogUnits.has(unit)) issues.push({ severity: "error", message: "A feed top-off has an unknown unit." });
  }

  for (const log of scoped.egg_logs) {
    const coopId = textAny(log, ["coop_id", "coopId"]);
    const birdId = textAny(log, ["bird_id", "birdId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: "An egg log references an unknown coop." });
    if (birdId && !birdIds.has(birdId)) issues.push({ severity: "error", message: "An egg log references an unknown bird." });
    if (!dateAny(log, ["logged_on", "loggedOn"])) issues.push({ severity: "error", message: "An egg log is missing a date." });
  }

  for (const log of scoped.weight_logs) {
    const birdId = textAny(log, ["bird_id", "birdId"]);
    if (!birdId || !birdIds.has(birdId)) issues.push({ severity: "error", message: "A weight log references an unknown bird." });
    if (!dateAny(log, ["weighed_on", "weighedOn"])) issues.push({ severity: "error", message: "A weight log is missing a date." });
  }

  for (const sale of scoped.sales) {
    const label = text(sale, "id") || textAny(sale, ["buyer"]) || "sale record";
    const itemType = upperAny(sale, ["item_type", "itemType"], "OTHER");
    if (!dateAny(sale, ["sold_on", "soldOn"])) issues.push({ severity: "error", message: `${label} is missing a sale date.` });
    if (!allowedSaleItemTypes.has(itemType)) issues.push({ severity: "error", message: `${label} has an unknown sale item type.` });
    if ((numberAny(sale, ["quantity"], 0) ?? 0) <= 0) issues.push({ severity: "error", message: `${label} must have a positive quantity.` });
    if ((numberAny(sale, ["unit_price", "unitPrice"], 0) ?? 0) < 0) issues.push({ severity: "error", message: `${label} cannot have a negative unit price.` });
    const coopId = textAny(sale, ["coop_id", "coopId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: `${label} references an unknown coop.` });
    const birdId = textAny(sale, ["bird_id", "birdId"]);
    if (birdId && !birdIds.has(birdId)) issues.push({ severity: "error", message: `${label} references an unknown bird.` });
    const lineId = textAny(sale, ["breeding_line_id", "breedingLineId"]);
    if (lineId && !breedingLineIds.has(lineId)) issues.push({ severity: "error", message: `${label} references an unknown breeding line.` });
    const periodId = textAny(sale, ["mating_period_id", "matingPeriodId"]);
    if (periodId && !matingPeriodIds.has(periodId)) issues.push({ severity: "error", message: `${label} references an unknown mating period.` });
    const hatchBatchId = textAny(sale, ["hatch_batch_id", "hatchBatchId"]);
    if (hatchBatchId && !hatchBatchIds.has(hatchBatchId)) issues.push({ severity: "error", message: `${label} references an unknown hatch batch.` });
  }

  for (const event of scoped.bird_health_events) {
    const label = text(event, "title") || text(event, "id") || "health record";
    const eventType = upperAny(event, ["event_type", "eventType"], "OTHER");
    const severity = upperAny(event, ["severity"], "LOW");
    const outcome = upperAny(event, ["outcome"], "OPEN");
    if (!dateAny(event, ["observed_on", "observedOn"])) issues.push({ severity: "error", message: `${label} is missing an observed date.` });
    if (!text(event, "title")) issues.push({ severity: "error", message: "A health record is missing a title." });
    if (!allowedHealthEventTypes.has(eventType)) issues.push({ severity: "error", message: `${label} has an unknown event type.` });
    if (!allowedHealthSeverities.has(severity)) issues.push({ severity: "error", message: `${label} has an unknown severity.` });
    if (!allowedHealthOutcomes.has(outcome)) issues.push({ severity: "error", message: `${label} has an unknown outcome.` });
    const coopId = textAny(event, ["coop_id", "coopId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: `${label} references an unknown coop.` });
    const birdId = textAny(event, ["bird_id", "birdId"]);
    if (birdId && !birdIds.has(birdId)) issues.push({ severity: "error", message: `${label} references an unknown bird.` });
  }

  for (const [section, label] of [
    ["coops", "coop"],
    ["breeding_lines", "breeding line"],
    ["hatch_batches", "hatch batch"],
    ["incubations", "incubation"],
    ["birds", "bird"],
    ["feed_types", "feed"]
  ] as Array<[ImportSectionKey, string]>) {
    const matches = scoped[section].filter((record) => {
      const key = recordNaturalKey(section, record);
      return key && existing.keys.get(section)?.has(key);
    });
    if (matches.length) {
      issues.push({
        severity: "warning",
        message:
          options.conflictMode === "replace"
            ? `${matches.length} existing ${label}${matches.length === 1 ? "" : "s"} will be replaced in this restore scope.`
            : `${matches.length} existing ${label}${matches.length === 1 ? "" : "s"} will be skipped and used for references.`
      });
    }
  }

  const recordCounts = importSections.map(([label, key]) => ({ label, count: records[key].length }));
  const scopedCounts = importSections.map(([label, key]) => ({ label, count: scoped[key].length }));
  const recordTotal = scopedCounts.reduce((sum, item) => sum + item.count, 0);
  if (recordTotal === 0 && options.scope !== "settings" && options.scope !== "photos") {
    issues.push({ severity: "error", message: "No recognized records were found for the selected restore scope." });
  }

  const totals = {
    records: recordTotal,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length
  };

  return { fileName, format, recordCounts, scopedRecordCounts: scopedCounts, restore: { scope: options.scope, conflictMode: options.conflictMode }, issues, totals, canImport: totals.errors === 0 && (recordTotal > 0 || options.scope === "settings" || options.scope === "photos") };
}

async function deletePhotosForScope(homesteadId: string, scope: RestoreScope) {
  const entityTypes =
    scope === "all" || scope === "photos"
      ? ["BIRD", "FEED", "HEALTH_EVENT"]
      : scope === "birds"
        ? ["BIRD"]
        : scope === "feed"
          ? ["FEED"]
          : scope === "health"
            ? ["HEALTH_EVENT"]
            : [];
  if (!entityTypes.length) return;
  const result = await db.query(
    `delete from photo_attachments
      where homestead_id = $1
        and entity_type = any($2::text[])
      returning storage_path`,
    [homesteadId, entityTypes]
  );
  await Promise.all(result.rows.map((row) => (row.storage_path ? unlink(row.storage_path).catch(() => undefined) : undefined)));
}

async function deleteRestoreScope(client: PoolClient, homesteadId: string, scope: RestoreScope) {
  if (scope === "settings") return;
  if (scope === "photos") {
    await deletePhotosForScope(homesteadId, scope);
    return;
  }

  if (scope === "all") {
    await deletePhotosForScope(homesteadId, scope);
    await client.query("delete from bird_health_events where homestead_id = $1", [homesteadId]);
    await client.query("delete from sales where homestead_id = $1", [homesteadId]);
    await client.query("delete from weight_logs where homestead_id = $1", [homesteadId]);
    await client.query("delete from egg_logs where homestead_id = $1", [homesteadId]);
    await client.query("delete from feed_inventory_events where homestead_id = $1", [homesteadId]);
    await client.query("delete from feed_logs where homestead_id = $1", [homesteadId]);
    await client.query("delete from incubations where homestead_id = $1", [homesteadId]);
    await client.query("delete from hatch_batches where homestead_id = $1", [homesteadId]);
    await client.query("delete from mating_periods where homestead_id = $1", [homesteadId]);
    await client.query("delete from birds where homestead_id = $1", [homesteadId]);
    await client.query("delete from feed_types where homestead_id = $1", [homesteadId]);
    await client.query("delete from breeding_lines where homestead_id = $1", [homesteadId]);
    await client.query("delete from coops where homestead_id = $1", [homesteadId]);
    return;
  }

  if (scope === "coops") {
    await client.query("delete from coops where homestead_id = $1", [homesteadId]);
  } else if (scope === "birds") {
    await deletePhotosForScope(homesteadId, scope);
    await client.query("delete from birds where homestead_id = $1", [homesteadId]);
  } else if (scope === "breeding") {
    await client.query("delete from mating_periods where homestead_id = $1", [homesteadId]);
    await client.query("delete from breeding_lines where homestead_id = $1", [homesteadId]);
  } else if (scope === "incubation") {
    await client.query("delete from incubations where homestead_id = $1", [homesteadId]);
    await client.query("delete from hatch_batches where homestead_id = $1", [homesteadId]);
  } else if (scope === "eggs") {
    await client.query("delete from egg_logs where homestead_id = $1", [homesteadId]);
  } else if (scope === "feed") {
    await deletePhotosForScope(homesteadId, scope);
    await client.query("delete from feed_inventory_events where homestead_id = $1", [homesteadId]);
    await client.query("delete from feed_logs where homestead_id = $1", [homesteadId]);
    await client.query("delete from feed_types where homestead_id = $1", [homesteadId]);
  } else if (scope === "sales") {
    await client.query("delete from sales where homestead_id = $1", [homesteadId]);
  } else if (scope === "health") {
    await deletePhotosForScope(homesteadId, scope);
    await client.query("delete from bird_health_events where homestead_id = $1", [homesteadId]);
  }
}

async function importData(user: SessionUser, data: unknown, options: RestoreOptions) {
  const preview = await buildImportPreview(data, user.homestead_id, "selected file", options);
  if (!preview.canImport) return { imported: false as const, preview };

  const { root, records: allRecords } = importRecords(data);
  let records = scopedRecords(allRecords, options.scope);
  const before = await dashboardTotals(user.homestead_id);
  const client = await db.connect();
  let maps: IdMaps;
  const importedCounts: Record<string, number> = {};
  let skippedCounts: Record<string, number> = {};

  try {
    await client.query("begin");

    if (options.conflictMode === "replace") {
      await deleteRestoreScope(client, user.homestead_id, options.scope);
    }

    const existing = await existingRestoreState(user.homestead_id, allRecords, clientQueryable(client));
    maps = existing.maps;
    if (options.conflictMode === "skip") {
      const filtered = filterExisting(records, existing.keys, maps);
      records = filtered.records;
      skippedCounts = filtered.skipped;
    }

    if (options.applySettings) {
      const homestead = asRecord(root.homestead);
      const profile = asRecord(homestead.profile);
      const preferences = asRecord(homestead.preferences);
      if (text(homestead, "name") || Object.keys(profile).length) {
        await client.query(
          `update homesteads
              set name = coalesce($2, name),
                  profile = case when $3::jsonb = '{}'::jsonb then profile else $3::jsonb end,
                  updated_at = now()
            where id = $1`,
          [user.homestead_id, text(homestead, "name") || null, JSON.stringify(profile)]
        );
      }
      if (Object.keys(preferences).length) {
        await client.query(
          `insert into homestead_settings (homestead_id, preferences)
           values ($1, $2::jsonb)
           on conflict (homestead_id)
           do update set preferences = homestead_settings.preferences || excluded.preferences,
                         updated_at = now()`,
          [user.homestead_id, JSON.stringify(preferences)]
        );
      }
    }

    for (const coop of records.coops) {
      const result = await client.query(
        `insert into coops (homestead_id, name, type, capacity, notes)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [user.homestead_id, text(coop, "name"), upperAny(coop, ["type"], "OTHER"), numberAny(coop, ["capacity"], null), nullableText(coop, ["notes"])]
      );
      if (text(coop, "id")) maps.coops.set(text(coop, "id"), result.rows[0].id);
    }
    importedCounts.coops = records.coops.length;

    for (const line of records.breeding_lines) {
      const result = await client.query(
        `insert into breeding_lines (homestead_id, name, goal, notes, active)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [user.homestead_id, text(line, "name"), nullableText(line, ["goal"]), nullableText(line, ["notes"]), boolAny(line, ["active"], true)]
      );
      if (text(line, "id")) maps.breeding_lines.set(text(line, "id"), result.rows[0].id);
    }
    importedCounts.breeding_lines = records.breeding_lines.length;

    for (const batch of records.hatch_batches) {
      const result = await client.query(
        `insert into hatch_batches (homestead_id, breeding_line_id, label, hatch_date, eggs_set, fertile_eggs, hatched_count, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          user.homestead_id,
          mapRef(batch, ["breeding_line_id", "breedingLineId"], maps.breeding_lines),
          text(batch, "label"),
          dateAny(batch, ["hatch_date", "hatchDate"]),
          integerAny(batch, ["eggs_set", "eggsSet"], 0),
          numberAny(batch, ["fertile_eggs", "fertileEggs"], null),
          numberAny(batch, ["hatched_count", "hatchedCount"], null),
          nullableText(batch, ["notes"])
        ]
      );
      if (text(batch, "id")) maps.hatch_batches.set(text(batch, "id"), result.rows[0].id);
    }
    importedCounts.hatch_batches = records.hatch_batches.length;

    for (const bird of records.birds) {
      const sex = upperAny(bird, ["sex"], "UNKNOWN");
      const status = upperAny(bird, ["status"], "ACTIVE");
      const result = await client.query(
        `insert into birds (
           homestead_id, hatch_batch_id, breeding_line_id, coop_id, name, band, sex, status,
           hatch_date, processed_date, current_weight_oz, dressed_weight_oz, temperament, breeder_rating, notes
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         returning id`,
        [
          user.homestead_id,
          mapRef(bird, ["hatch_batch_id", "hatchBatchId"], maps.hatch_batches),
          mapRef(bird, ["breeding_line_id", "breedingLineId"], maps.breeding_lines),
          mapRef(bird, ["coop_id", "coopId"], maps.coops),
          nullableText(bird, ["name"]),
          nullableText(bird, ["band"]),
          sex,
          status,
          dateAny(bird, ["hatch_date", "hatchDate"]),
          dateAny(bird, ["processed_date", "processedDate"]),
          numberAny(bird, ["current_weight_oz", "currentWeightOz"], null),
          numberAny(bird, ["dressed_weight_oz", "dressedWeightOz"], null),
          nullableText(bird, ["temperament"]),
          nullableText(bird, ["breeder_rating", "breederRating"]),
          nullableText(bird, ["notes"])
        ]
      );
      if (text(bird, "id")) maps.birds.set(text(bird, "id"), result.rows[0].id);
    }
    importedCounts.birds = records.birds.length;

    for (const period of records.mating_periods) {
      const result = await client.query(
        `insert into mating_periods (homestead_id, breeding_line_id, coop_id, sire_id, label, started_on, ended_on, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         returning id`,
        [
          user.homestead_id,
          mapRef(period, ["breeding_line_id", "breedingLineId"], maps.breeding_lines),
          mapRef(period, ["coop_id", "coopId"], maps.coops),
          mapRef(period, ["sire_id", "sireId"], maps.birds),
          text(period, "label"),
          dateAny(period, ["started_on", "startedOn"]),
          dateAny(period, ["ended_on", "endedOn"]),
          nullableText(period, ["notes"])
        ]
      );
      if (text(period, "id")) maps.mating_periods.set(text(period, "id"), result.rows[0].id);
    }
    importedCounts.mating_periods = records.mating_periods.length;

    for (const hen of records.mating_period_hens) {
      await client.query(
        `insert into mating_period_hens (mating_period_id, hen_id, joined_on, left_on)
         values ($1, $2, $3, $4)
         on conflict do nothing`,
        [
          mapRef(hen, ["mating_period_id", "matingPeriodId"], maps.mating_periods),
          mapRef(hen, ["hen_id", "henId", "birdId"], maps.birds),
          dateAny(hen, ["joined_on", "joinedOn"]),
          dateAny(hen, ["left_on", "leftOn"])
        ]
      );
    }
    importedCounts.mating_period_hens = records.mating_period_hens.length;

    for (const cycle of records.incubations) {
      const setDate = dateAny(cycle, ["set_date", "setDate"]);
      const expectedHatchDate = dateAny(cycle, ["expected_hatch_date", "expectedHatchDate"]) || (setDate ? addDays(setDate, 17) : null);
      const result = await client.query(
        `insert into incubations (
           homestead_id, mating_period_id, hatch_batch_id, label, set_date, expected_hatch_date,
           lockdown_date, candle_date, eggs_set, fertile_eggs, hatched_count, parameters, notes
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
         returning id`,
        [
          user.homestead_id,
          mapRef(cycle, ["mating_period_id", "matingPeriodId"], maps.mating_periods),
          mapRef(cycle, ["hatch_batch_id", "hatchBatchId"], maps.hatch_batches),
          text(cycle, "label"),
          setDate,
          expectedHatchDate,
          dateAny(cycle, ["lockdown_date", "lockdownDate"]),
          dateAny(cycle, ["candle_date", "candleDate"]),
          integerAny(cycle, ["eggs_set", "eggsSet"], 0),
          numberAny(cycle, ["fertile_eggs", "fertileEggs"], null),
          numberAny(cycle, ["hatched_count", "hatchedCount"], null),
          JSON.stringify(asRecord(cycle.parameters)),
          nullableText(cycle, ["notes"])
        ]
      );
      if (text(cycle, "id")) maps.incubations.set(text(cycle, "id"), result.rows[0].id);
    }
    importedCounts.incubations = records.incubations.length;

    for (const batch of records.hatch_batches) {
      const id = maps.hatch_batches.get(text(batch, "id"));
      if (!id) continue;
      await client.query(
        `update hatch_batches
            set mating_period_id = coalesce($2, mating_period_id),
                incubation_id = coalesce($3, incubation_id),
                updated_at = now()
          where id = $1`,
        [
          id,
          mapRef(batch, ["mating_period_id", "matingPeriodId"], maps.mating_periods),
          mapRef(batch, ["incubation_id", "incubationId"], maps.incubations)
        ]
      );
    }

    for (const feed of records.feed_types) {
      const result = await client.query(
        `insert into feed_types (homestead_id, brand, name, vendor, protein_percent, bag_weight_lb, bag_cost, cup_weight_oz, inventory_cups, active)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         returning id`,
        [
          user.homestead_id,
          text(feed, "brand"),
          text(feed, "name"),
          textAny(feed, ["vendor", "store", "purchasedFrom"]) || null,
          numberAny(feed, ["protein_percent", "proteinPercent"], null),
          numberAny(feed, ["bag_weight_lb", "bagWeightLb"], 1),
          numberAny(feed, ["bag_cost", "bagCost"], 0),
          numberAny(feed, ["cup_weight_oz", "cupWeightOz"], 8),
          numberAny(feed, ["inventory_cups", "inventoryCups"], 0),
          boolAny(feed, ["active"], true)
        ]
      );
      if (text(feed, "id")) maps.feed_types.set(text(feed, "id"), result.rows[0].id);
    }
    importedCounts.feed_types = records.feed_types.length;

    for (const event of records.feed_inventory_events) {
      await client.query(
        `insert into feed_inventory_events (homestead_id, feed_type_id, logged_at, amount, unit, amount_cups, cost, notes)
         values ($1, $2, coalesce($3::timestamptz, now()), $4, $5, $6, $7, $8)`,
        [
          user.homestead_id,
          mapRef(event, ["feed_type_id", "feedTypeId"], maps.feed_types),
          datetimeAny(event, ["logged_at", "loggedAt"]),
          numberAny(event, ["amount"], 0),
          text(event, "unit") || "bag",
          numberAny(event, ["amount_cups", "amountCups"], numberAny(event, ["amount"], 0) ?? 0),
          numberAny(event, ["cost"], null),
          nullableText(event, ["notes"])
        ]
      );
    }
    importedCounts.feed_inventory_events = records.feed_inventory_events.length;

    for (const log of records.feed_logs) {
      await client.query(
        `insert into feed_logs (homestead_id, coop_id, feed_type_id, logged_at, amount, unit, notes)
         values ($1, $2, $3, coalesce($4::timestamptz, now()), $5, $6, $7)`,
        [
          user.homestead_id,
          mapRef(log, ["coop_id", "coopId"], maps.coops),
          mapRef(log, ["feed_type_id", "feedTypeId"], maps.feed_types),
          datetimeAny(log, ["logged_at", "loggedAt"]),
          numberAny(log, ["amount"], 0),
          text(log, "unit") || "cup",
          nullableText(log, ["notes"])
        ]
      );
    }
    importedCounts.feed_logs = records.feed_logs.length;

    for (const log of records.egg_logs) {
      await client.query(
        `insert into egg_logs (homestead_id, coop_id, bird_id, logged_on, quantity, fertile_quantity, notes)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          user.homestead_id,
          mapRef(log, ["coop_id", "coopId"], maps.coops),
          mapRef(log, ["bird_id", "birdId"], maps.birds),
          dateAny(log, ["logged_on", "loggedOn"]),
          integerAny(log, ["quantity"], 0),
          null,
          nullableText(log, ["notes"])
        ]
      );
    }
    importedCounts.egg_logs = records.egg_logs.length;

    for (const log of records.weight_logs) {
      await client.query(
        `insert into weight_logs (homestead_id, bird_id, weighed_on, weight_oz, notes)
         values ($1, $2, $3, $4, $5)
         on conflict (bird_id, weighed_on)
         do update set weight_oz = excluded.weight_oz,
                       notes = excluded.notes,
                       created_at = now()`,
        [
          user.homestead_id,
          mapRef(log, ["bird_id", "birdId"], maps.birds),
          dateAny(log, ["weighed_on", "weighedOn"]),
          numberAny(log, ["weight_oz", "weightOz"], 0),
          nullableText(log, ["notes"])
        ]
      );
    }
    importedCounts.weight_logs = records.weight_logs.length;

    for (const sale of records.sales) {
      await client.query(
        `insert into sales (
           homestead_id, sold_on, item_type, quantity, unit, unit_price, buyer, coop_id, bird_id,
           breeding_line_id, mating_period_id, incubation_id, hatch_batch_id, notes
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          user.homestead_id,
          dateAny(sale, ["sold_on", "soldOn"]),
          upperAny(sale, ["item_type", "itemType"], "OTHER"),
          numberAny(sale, ["quantity"], 0),
          textAny(sale, ["unit"]) || "each",
          numberAny(sale, ["unit_price", "unitPrice"], 0),
          nullableText(sale, ["buyer"]),
          mapRef(sale, ["coop_id", "coopId"], maps.coops),
          mapRef(sale, ["bird_id", "birdId"], maps.birds),
          mapRef(sale, ["breeding_line_id", "breedingLineId"], maps.breeding_lines),
          mapRef(sale, ["mating_period_id", "matingPeriodId"], maps.mating_periods),
          mapRef(sale, ["incubation_id", "incubationId"], maps.incubations),
          mapRef(sale, ["hatch_batch_id", "hatchBatchId"], maps.hatch_batches),
          nullableText(sale, ["notes"])
        ]
      );
    }
    importedCounts.sales = records.sales.length;

    for (const event of records.bird_health_events) {
      const result = await client.query(
        `insert into bird_health_events (
           homestead_id, bird_id, coop_id, observed_on, event_type, severity, outcome,
           title, notes, treatment, follow_up_on
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning id`,
        [
          user.homestead_id,
          mapRef(event, ["bird_id", "birdId"], maps.birds),
          mapRef(event, ["coop_id", "coopId"], maps.coops),
          dateAny(event, ["observed_on", "observedOn"]),
          upperAny(event, ["event_type", "eventType"], "OTHER"),
          upperAny(event, ["severity"], "LOW"),
          upperAny(event, ["outcome"], "OPEN"),
          textAny(event, ["title"]) || "Imported health record",
          nullableText(event, ["notes"]),
          nullableText(event, ["treatment"]),
          dateAny(event, ["follow_up_on", "followUpOn"])
        ]
      );
      if (text(event, "id")) maps.health_events.set(text(event, "id"), result.rows[0].id);
    }
    importedCounts.bird_health_events = records.bird_health_events.length;

    await client.query(
      `update birds
          set current_weight_oz = (
                select weight_oz
                  from weight_logs
                 where weight_logs.bird_id = birds.id
                 order by weighed_on desc, created_at desc
                 limit 1
              ),
              updated_at = now()
        where homestead_id = $1
          and id = any($2::uuid[])`,
      [user.homestead_id, Array.from(maps.birds.values())]
    );

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const after = await dashboardTotals(user.homestead_id);
  return { imported: true as const, preview, importedCounts, skippedCounts, comparison: { before, after }, idMaps: maps! };
}

function parseBundle(dataUrl: string) {
  const entries = readZip(dataUrlToBuffer(dataUrl));
  const dataEntry = entries.get("data.json");
  if (!dataEntry) throw new Error("Backup bundle is missing data.json.");
  const data = JSON.parse(dataEntry.toString("utf8")) as unknown;
  const manifestEntry = entries.get("manifest.json");
  const manifest = manifestEntry ? (JSON.parse(manifestEntry.toString("utf8")) as ExportRecord) : {};
  return { entries, data, manifest };
}

function bundlePhotoRecords(data: unknown) {
  const root = asRecord(data);
  return asRecordArray(root.photo_attachments);
}

function photoEntityMap(entityType: string, maps: IdMaps) {
  if (entityType === "BIRD") return maps.birds;
  if (entityType === "FEED") return maps.feed_types;
  if (entityType === "HEALTH_EVENT") return maps.health_events;
  return null;
}

function photoAllowedForScope(entityType: string, scope: RestoreScope) {
  if (scope === "all" || scope === "photos") return true;
  if (scope === "birds") return entityType === "BIRD";
  if (scope === "feed") return entityType === "FEED";
  if (scope === "health") return entityType === "HEALTH_EVENT";
  return false;
}

async function importBundlePhotos(user: SessionUser, data: unknown, entries: Map<string, Buffer>, maps: IdMaps, scope: RestoreScope) {
  let imported = 0;
  let skipped = 0;

  for (const photo of bundlePhotoRecords(data)) {
    const entityType = upperAny(photo, ["entity_type", "entityType"], "");
    if (!photoAllowedForScope(entityType, scope)) continue;
    const idMap = photoEntityMap(entityType, maps);
    const oldEntityId = textAny(photo, ["entity_id", "entityId"]);
    const newEntityId = oldEntityId && idMap ? idMap.get(oldEntityId) : null;
    const bundlePath = safeZipPath(textAny(photo, ["bundle_path", "bundlePath"]));
    const bytes = bundlePath ? entries.get(bundlePath) : null;
    if (!newEntityId || !bytes?.length) {
      skipped += 1;
      continue;
    }

    const fileName = textAny(photo, ["file_name", "fileName"]) || "photo";
    const mimeType = textAny(photo, ["mime_type", "mimeType"]) || "application/octet-stream";
    const extension = extname(fileName) || ".img";
    const storedFileName = `${Date.now()}-${imported}-${safeFileBase(fileName)}${extension}`;
    const folder = join(env.UPLOAD_DIR, user.homestead_id, entityType.toLowerCase());
    const storagePath = join(folder, storedFileName);
    await mkdir(folder, { recursive: true });
    await writeFile(storagePath, bytes);

    await db.query(
      `insert into photo_attachments (homestead_id, entity_type, entity_id, file_name, mime_type, storage_path, byte_size, caption)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        user.homestead_id,
        entityType,
        newEntityId,
        fileName,
        mimeType,
        storagePath,
        bytes.length,
        nullableText(photo, ["caption"])
      ]
    );
    imported += 1;
  }

  return { imported, skipped, available: bundlePhotoRecords(data).filter((photo) => photoAllowedForScope(upperAny(photo, ["entity_type", "entityType"], ""), scope)).length };
}

export async function dataRoutes(app: FastifyInstance) {
  app.get("/data/export", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const exported = await buildHomesteadExport(user.homestead_id, {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role
    });
    const exportedAt = new Date();
    const date = exportedAt.toISOString().slice(0, 10);

    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${exported.filenameBase}-export-${date}.json"`);
    return exported.payload;
  });

  app.get("/data/export/bundle", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const query = asRecord(request.query);
    const includePhotos = text(query, "photos") !== "false";
    const bundle = await buildHomesteadBundle(
      user.homestead_id,
      {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role
      },
      includePhotos
    );
    const date = new Date().toISOString().slice(0, 10);
    reply.header("Content-Type", "application/zip");
    reply.header("Content-Length", String(bundle.zip.length));
    reply.header("Content-Disposition", `attachment; filename="${bundle.filenameBase}-bundle-${date}.zip"`);
    return reply.send(bundle.zip);
  });

  app.get("/data/backups", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    return { backups: await backupStatus(user.homestead_id) };
  });

  app.post("/data/backups/run", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    if (user.role !== "OWNER") return reply.code(403).send({ message: "Only owners can run backups." });

    try {
      const backup = await createBackupRun(user.homestead_id, "MANUAL");
      return reply.code(201).send({ backup, backups: await backupStatus(user.homestead_id) });
    } catch (error) {
      const backupRun = error && typeof error === "object" && "backupRun" in error ? error.backupRun : null;
      return reply.code(500).send({
        message: error instanceof Error ? error.message : "Backup failed.",
        backup: backupRun,
        backups: await backupStatus(user.homestead_id)
      });
    }
  });

  app.get("/data/backups/:id/download", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const params = backupParamsSchema.parse(request.params);
    const result = await db.query(
      `select id, file_name, file_path
         from backup_runs
        where id = $1
          and homestead_id = $2
          and status = 'SUCCESS'`,
      [params.id, user.homestead_id]
    );
    const backup = result.rows[0];
    if (!backup?.file_path || !backup?.file_name) return reply.code(404).send({ message: "Backup file not found." });
    const fileInfo = await stat(backup.file_path).catch(() => null);
    if (!fileInfo) return reply.code(404).send({ message: "Backup file is no longer on disk." });

    reply.header("Content-Type", "application/json; charset=utf-8");
    reply.header("Content-Length", String(fileInfo.size));
    reply.header("Content-Disposition", `attachment; filename="${basename(backup.file_name)}"`);
    return reply.send(createReadStream(backup.file_path));
  });

  app.post("/data/import/preview", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const input = importBodySchema.parse(request.body);
    const options = restoreOptions(input.options);
    return { preview: await buildImportPreview(input.data, user.homestead_id, "selected file", options) };
  });

  app.post("/data/import/bundle/preview", { bodyLimit: 120 * 1024 * 1024 }, async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const input = bundleImportBodySchema.parse(request.body);
    const options = restoreOptions(input.options);
    const bundle = parseBundle(input.dataUrl);
    const preview = await buildImportPreview(bundle.data, user.homestead_id, input.fileName ?? "backup bundle", options);
    const photos = bundlePhotoRecords(bundle.data);
    return {
      preview,
      manifest: bundle.manifest,
      bundle: {
        photos: photos.length,
        files: bundle.entries.size
      }
    };
  });

  app.post("/data/import", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = importBodySchema.parse(request.body);
    const options = restoreOptions(input.options);
    if (options.conflictMode === "replace") {
      if (user.role !== "OWNER") return reply.code(403).send({ message: "Only owners can replace restore scopes." });
      const expected = `REPLACE ${options.scope.toUpperCase()}`;
      if (options.confirmReplace !== expected) {
        return reply.code(400).send({ message: `Type ${expected} to replace this restore scope.` });
      }
      await createBackupRun(user.homestead_id, "MANUAL");
    }
    const result = await importData(user, input.data, options);
    if (!result.imported) {
      return reply.code(400).send({ message: "Import has validation errors. Review the preview before importing.", preview: result.preview });
    }
    const { idMaps: _idMaps, ...response } = result;
    return reply.code(201).send(response);
  });

  app.post("/data/import/bundle", { bodyLimit: 120 * 1024 * 1024 }, async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = bundleImportBodySchema.parse(request.body);
    const options = restoreOptions(input.options);
    const bundle = parseBundle(input.dataUrl);
    if (options.conflictMode === "replace") {
      if (user.role !== "OWNER") return reply.code(403).send({ message: "Only owners can replace restore scopes." });
      const expected = `REPLACE ${options.scope.toUpperCase()}`;
      if (options.confirmReplace !== expected) {
        return reply.code(400).send({ message: `Type ${expected} to replace this restore scope.` });
      }
      await createBackupRun(user.homestead_id, "MANUAL");
    }
    const result = await importData(user, bundle.data, options);
    if (!result.imported) {
      return reply.code(400).send({ message: "Import has validation errors. Review the preview before importing.", preview: result.preview });
    }
    const photos = await importBundlePhotos(user, bundle.data, bundle.entries, result.idMaps, options.scope);
    const { idMaps: _idMaps, ...response } = result;
    return reply.code(201).send({ ...response, bundle: { photos } });
  });
}

let backupSchedulerTimer: NodeJS.Timeout | null = null;

export function startBackupScheduler(logger: FastifyBaseLogger) {
  if (backupSchedulerTimer) return;

  async function runDueBackups() {
    const result = await db.query(
      `select homestead_id, preferences
         from homestead_settings
        where preferences->'backupSchedule'->>'enabled' = 'true'`
    );
    const now = Date.now();

    for (const row of result.rows) {
      try {
        const status = await backupStatus(row.homestead_id);
        if (!status.settings.enabled || !status.nextDueAt) continue;
        if (new Date(status.nextDueAt).getTime() > now) continue;
        await createBackupRun(row.homestead_id, "SCHEDULED");
        logger.info({ homesteadId: row.homestead_id }, "Scheduled backup completed.");
      } catch (error) {
        logger.error({ error, homesteadId: row.homestead_id }, "Scheduled backup failed.");
      }
    }
  }

  backupSchedulerTimer = setInterval(() => {
    void runDueBackups();
  }, env.BACKUP_SCHEDULE_CHECK_MS);

  void runDueBackups();
}
