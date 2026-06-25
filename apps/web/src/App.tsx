import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, FormEvent, ReactNode, SetStateAction } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

type ApiState = "checking" | "online" | "offline";
type AuthMode = "register" | "login" | "mfa" | "reset-request" | "reset-complete";
type ThemeMode = "auto" | "light" | "dark";

type User = {
  id: string;
  homestead_id: string;
  email: string;
  display_name: string;
  role: "OWNER" | "KEEPER" | "VIEWER";
  mfa_enabled: boolean;
};

type ManagedUser = User & {
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
};

type AuditEvent = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  user_id: string | null;
  user_display_name: string | null;
  user_email: string | null;
};

type MfaSetup = {
  secret: string;
  otpauthUrl: string;
};

type PendingLogin = {
  email: string;
  password: string;
  rememberMe: boolean;
};

type Homestead = {
  id: string;
  name: string;
  profile: Record<string, unknown>;
  preferences: Record<string, unknown>;
};

type CoopType = "BREEDING" | "GROW_OUT" | "BROODER" | "HOSPITAL" | "OTHER";

type Coop = {
  id: string;
  name: string;
  type: CoopType;
  capacity: number | null;
  has_camera: boolean;
  bird_count?: string | number;
  active_bird_count?: string | number;
  notes: string | null;
};

type CameraPlaybackMode = "webrtc" | "mse" | "auto" | "mjpeg";

type CameraStatus = {
  configured: boolean;
  streamName: string;
  mjpegUrl: string;
  playerUrl: string | null;
  playerUrls?: Partial<Record<Exclude<CameraPlaybackMode, "mjpeg">, string | null>>;
  playbackMode: CameraPlaybackMode;
  health: "registered";
};

type CameraHealth = {
  ok: boolean;
  streamRegistered: boolean;
  mjpegAvailable: boolean;
  mjpegSource?: string | null;
  preferredPlayback?: CameraPlaybackMode;
  webrtcCandidate?: string;
  webrtcListen?: string;
  streamInfo?: {
    codecs: string[];
    videoCodecs: string[];
    audioCodecs: string[];
    producerCount: number;
    consumerCount: number;
  };
  diagnostics?: string[];
  message: string;
};

type BirdSex = "MALE" | "FEMALE" | "UNKNOWN";
type BirdStatus = "ACTIVE" | "PROCESSED" | "SOLD" | "DIED" | "RETIRED" | "CULLED";

type Bird = {
  id: string;
  name: string | null;
  band: string | null;
  sex: BirdSex;
  status: BirdStatus;
  hatch_batch_id: string | null;
  hatch_batch_label: string | null;
  breeding_line_id: string | null;
  breeding_line_name: string | null;
  coop_id: string | null;
  coop_name: string | null;
  hatch_date: string | null;
  processed_date: string | null;
  current_weight_oz: string | number | null;
  notes: string | null;
};

type FeedType = {
  id: string;
  brand: string;
  name: string;
  vendor: string | null;
  protein_percent: string | number | null;
  bag_weight_lb: string | number;
  bag_cost: string | number;
  cup_weight_oz: string | number;
  inventory_cups: string | number;
  active: boolean;
};

type FeedLog = {
  id: string;
  coop_id: string;
  coop_name: string;
  feed_type_id: string;
  feed_brand: string;
  feed_name: string;
  bag_weight_lb: string | number;
  bag_cost: string | number;
  cup_weight_oz: string | number;
  logged_at: string;
  amount: string | number;
  unit: "cup" | "lb" | "oz";
  notes: string | null;
  active_bird_count: string | number;
  amount_lb: string | number;
  cost: string | number;
};

type FeedInventoryEvent = {
  id: string;
  feed_type_id: string;
  feed_brand: string;
  feed_name: string;
  logged_at: string;
  amount: string | number;
  unit: "bag" | "cup" | "lb" | "oz";
  amount_cups: string | number;
  cost: string | number | null;
  notes: string | null;
};

type SaleItemType = "TABLE_EGGS" | "FERTILE_EGGS" | "CHICKS" | "BIRDS" | "MEAT" | "OTHER";

type SaleRecord = {
  id: string;
  sold_on: string;
  item_type: SaleItemType;
  quantity: string | number;
  unit: string;
  unit_price: string | number;
  total_price: string | number;
  buyer: string | null;
  coop_id: string | null;
  coop_name: string | null;
  bird_id: string | null;
  bird_name: string | null;
  bird_band: string | null;
  breeding_line_id: string | null;
  breeding_line_name: string | null;
  mating_period_id: string | null;
  mating_period_label: string | null;
  incubation_id: string | null;
  incubation_label: string | null;
  hatch_batch_id: string | null;
  hatch_batch_label: string | null;
  notes: string | null;
};

type HealthEventType = "HEALTH" | "INJURY" | "TREATMENT" | "QUARANTINE" | "BEHAVIOR" | "MORTALITY" | "OTHER";
type HealthSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type HealthOutcome = "OPEN" | "MONITORING" | "RESOLVED" | "CULLED" | "DIED";

type HealthEvent = {
  id: string;
  bird_id: string | null;
  bird_name: string | null;
  bird_band: string | null;
  coop_id: string | null;
  coop_name: string | null;
  observed_on: string;
  event_type: HealthEventType;
  severity: HealthSeverity;
  outcome: HealthOutcome;
  title: string;
  notes: string | null;
  treatment: string | null;
  follow_up_on: string | null;
};

type PhotoEntityType = "BIRD" | "FEED" | "HEALTH_EVENT";

type PhotoAttachment = {
  id: string;
  entity_type: PhotoEntityType;
  entity_id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  caption: string | null;
  created_at: string;
};

type EggLog = {
  id: string;
  coop_id: string | null;
  coop_name: string | null;
  bird_id: string | null;
  bird_name: string | null;
  bird_band: string | null;
  breeding_line_id: string | null;
  breeding_line_name: string | null;
  mating_period_id: string | null;
  mating_period_label: string | null;
  logged_on: string;
  quantity: string | number;
  fertile_quantity: string | number | null;
  notes: string | null;
};

type WeightLog = {
  id: string;
  bird_id: string;
  weighed_on: string;
  weight_oz: string | number;
  notes: string | null;
  created_at: string;
};

type CohortWeightLog = WeightLog & {
  bird: Bird;
  ageDays: number;
};

type Incubation = {
  id: string;
  mating_period_id: string | null;
  hatch_batch_id: string | null;
  breeding_line_name: string | null;
  mating_period_label: string | null;
  label: string;
  set_date: string;
  expected_hatch_date: string;
  lockdown_date: string | null;
  candle_date: string | null;
  eggs_set: string | number;
  fertile_eggs: string | number | null;
  hatched_count: string | number | null;
  parameters: Record<string, unknown>;
  notes: string | null;
};

type HatchBatch = {
  id: string;
  breeding_line_id: string | null;
  breeding_line_name: string | null;
  mating_period_id: string | null;
  mating_period_label: string | null;
  incubation_id: string | null;
  incubation_label: string | null;
  label: string;
  hatch_date: string | null;
  eggs_set: string | number;
  fertile_eggs: string | number | null;
  hatched_count: string | number | null;
  chick_count: string | number;
  notes: string | null;
};

type BreedingLine = {
  id: string;
  name: string;
  goal: string | null;
  notes: string | null;
  active: boolean;
  mating_period_count: string | number;
  active_period_count: string | number;
  eggs_set: string | number;
  fertile_eggs: string | number;
  hatched_count: string | number;
};

type MatingPeriodHen = {
  id: string;
  label: string;
  joined_on: string;
  left_on: string | null;
};

type MatingPeriod = {
  id: string;
  breeding_line_id: string;
  breeding_line_name: string;
  coop_id: string | null;
  coop_name: string | null;
  sire_id: string | null;
  sire_label: string | null;
  label: string;
  started_on: string;
  ended_on: string | null;
  notes: string | null;
  hen_count: string | number;
  hens: MatingPeriodHen[];
  incubation_count: string | number;
  eggs_set: string | number;
  fertile_eggs: string | number;
  hatched_count: string | number;
};

type ApiError = {
  message?: string;
};

type SetupStep = "homestead" | "coops" | "birds" | "finish";
type SortDirection = "asc" | "desc";
type BirdColumnKey =
  | "sex"
  | "status"
  | "coop"
  | "hatchDate"
  | "age"
  | "processedDate"
  | "weight"
  | "feedCost"
  | "notes";
type BirdSortKey = "bird" | BirdColumnKey;
type EggSortKey = "date" | "source" | "quantity";
type CoopSortKey = "name" | "type" | "capacity" | "birds";
type FeedSortKey = "name" | "protein" | "bagCost" | "cups" | "cupCost" | "inventory" | "active";
type FeedLogSortKey = "date" | "coop" | "feed" | "amount" | "cost" | "birdCost";
type RestockSortKey = "date" | "feed" | "amount" | "cups" | "cost" | "cupCost";
type SettingsTab = "homestead" | "flock" | "tracking" | "value" | "incubation" | "data" | "users";
type CameraPlayerSize = "compact" | "standard" | "large";
type CameraGridPreset = "auto" | "2" | "4";
type ReportKind = "eggs" | "feed" | "sales" | "incubation" | "breeding" | "birdValue" | "health" | "dataQuality";
type DashboardSection =
  | "overview"
  | "chores"
  | "flock"
  | "coops"
  | "cameras"
  | "eggs"
  | "feed"
  | "sales"
  | "health"
  | "incubation"
  | "breeding"
  | "todos"
  | "recommendations"
  | "calendar"
  | "reports"
  | "audit"
  | "settings";

const dashboardSections: DashboardSection[] = [
  "overview",
  "chores",
  "flock",
  "coops",
  "cameras",
  "eggs",
  "feed",
  "sales",
  "health",
  "incubation",
  "breeding",
  "todos",
  "recommendations",
  "calendar",
  "reports",
  "audit",
  "settings"
];

type WorkItemPriority = "high" | "medium" | "low";
type WorkSortKey = "priority" | "date" | "section" | "title";
type CalendarKindFilter = "all" | "todo" | "recommendation" | "custom";
type CalendarPriorityFilter = "all" | WorkItemPriority;
type CalendarSectionFilter = "all" | DashboardSection;
type RecordTarget =
  | { type: "bird"; id: string }
  | { type: "breedingLine"; id: string }
  | { type: "matingPeriod"; id: string }
  | { type: "hatchBatch"; id: string };

type WorkItem = {
  id: string;
  title: string;
  detail: string;
  priority: WorkItemPriority;
  section: DashboardSection;
  dueDate?: string | null;
  kind?: "todo" | "recommendation" | "custom";
};

type CustomWorkItem = {
  id: string;
  title: string;
  detail: string;
  priority: WorkItemPriority;
  dueDate: string;
  section: DashboardSection;
  completedAt?: string | null;
  createdAt: string;
};

type ImportPreview = {
  fileName: string;
  format: string;
  recordCounts: Array<{ label: string; count: number }>;
  scopedRecordCounts?: Array<{ label: string; count: number }>;
  restore?: { scope: RestoreScope; conflictMode: ConflictMode };
  issues: Array<{ severity: "warning" | "error"; message: string }>;
  totals: {
    records: number;
    errors: number;
    warnings: number;
  };
  canImport?: boolean;
};

type RestoreScope = "all" | "settings" | "coops" | "birds" | "breeding" | "incubation" | "eggs" | "feed" | "sales" | "health" | "photos";
type ConflictMode = "skip" | "replace";
type RestoreOptions = {
  scope: RestoreScope;
  conflictMode: ConflictMode;
  confirmReplace?: string;
};

type ImportResult = {
  imported: true;
  importedCounts: Record<string, number>;
  skippedCounts?: Record<string, number>;
  bundle?: {
    photos?: {
      imported: number;
      skipped: number;
      available: number;
    };
  };
  comparison: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
  preview: ImportPreview;
};

type BundlePreviewResult = {
  preview: ImportPreview;
  manifest: Record<string, unknown>;
  bundle: {
    photos: number;
    files: number;
  };
};

type BackupSettings = {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek: number;
  dayOfMonth: number;
  timeOfDay: string;
  retentionCount: number;
};

type BackupRun = {
  id: string;
  status: "SUCCESS" | "FAILED";
  trigger_type: "MANUAL" | "SCHEDULED";
  file_name: string | null;
  byte_size: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string;
};

type BackupStatus = {
  settings: BackupSettings;
  lastSuccess: BackupRun | null;
  nextDueAt: string | null;
  history: BackupRun[];
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiUrl}${path}`, {
    credentials: "include",
    ...options,
    headers
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(body.message ?? "Request failed.");
  }

  return response.json() as Promise<T>;
}

function fieldValue(form: HTMLFormElement, name: string) {
  return String(new FormData(form).get(name) ?? "").trim();
}

function fieldValues(form: HTMLFormElement, name: string) {
  return new FormData(form)
    .getAll(name)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
}

function setFormField(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
    field.value = value;
  }
}

function normalizeFeedTopOffUnit(value: unknown): FeedLog["unit"] {
  return value === "lb" || value === "oz" || value === "cup" ? value : "cup";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function firstRecordArray(source: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const records = asRecordArray(source[key]);
    if (records.length) return records;
  }
  return [];
}

function textField(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function textAny(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = textField(record, key);
    if (value) return value;
  }
  return "";
}

function importPreviewFromJson(fileName: string, data: unknown): ImportPreview {
  const root = asRecord(data);
  const nestedRecords = asRecord(root.records);
  const records = Object.keys(nestedRecords).length ? nestedRecords : root;
  const format = textField(root, "format") || "unknown";
  const sections = [
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
    ["Weight logs", "weight_logs", ["weight_logs", "weightLogs"]]
  ] as const;

  const byKey = Object.fromEntries(sections.map(([, key, aliases]) => [key, firstRecordArray(records, aliases)])) as Record<string, Record<string, unknown>[]>;
  const issues: ImportPreview["issues"] = [];

  if (!Object.keys(root).length) {
    issues.push({ severity: "error", message: "The selected file is not a JSON object." });
  }
  if (!Object.keys(records).length) {
    issues.push({ severity: "error", message: "No importable record sections were found. Use a Covey export or compatible prototype export." });
  }
  if (format !== "covey.homestead-export.v1") {
    issues.push({ severity: "warning", message: `Format is "${format}". Preview will still check common prototype/Covey record sections.` });
  }

  const coopIds = new Set(byKey.coops.map((coop) => textField(coop, "id")).filter(Boolean));
  const breedingLineIds = new Set(byKey.breeding_lines.map((line) => textField(line, "id")).filter(Boolean));
  const birdIds = new Set(byKey.birds.map((bird) => textField(bird, "id")).filter(Boolean));
  const hatchBatchIds = new Set(byKey.hatch_batches.map((batch) => textField(batch, "id")).filter(Boolean));
  const matingPeriodIds = new Set(byKey.mating_periods.map((period) => textField(period, "id")).filter(Boolean));
  const feedTypeIds = new Set(byKey.feed_types.map((feed) => textField(feed, "id")).filter(Boolean));

  for (const coop of byKey.coops) {
    if (!textField(coop, "name")) issues.push({ severity: "error", message: "A coop is missing a name." });
    if (!textField(coop, "type")) issues.push({ severity: "warning", message: `Coop "${textField(coop, "name") || "unnamed"}" is missing a type; import would need a default.` });
  }

  const activeBands = new Map<string, string>();
  for (const bird of byKey.birds) {
    const label = textField(bird, "band") || textField(bird, "name") || textField(bird, "id") || "unnamed bird";
    if (!textField(bird, "sex")) issues.push({ severity: "warning", message: `${label} is missing sex; import would use UNKNOWN.` });
    const status = textField(bird, "status") || "ACTIVE";
    if (!textField(bird, "status")) issues.push({ severity: "warning", message: `${label} is missing status; import would use ACTIVE.` });
    const coopId = textAny(bird, ["coop_id", "coopId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: `${label} references an unknown coop.` });
    const lineId = textAny(bird, ["breeding_line_id", "breedingLineId"]);
    if (lineId && !breedingLineIds.has(lineId)) issues.push({ severity: "error", message: `${label} references an unknown breeding line.` });
    const hatchBatchId = textAny(bird, ["hatch_batch_id", "hatchBatchId"]);
    if (hatchBatchId && !hatchBatchIds.has(hatchBatchId)) issues.push({ severity: "error", message: `${label} references an unknown hatch batch.` });
    const band = textField(bird, "band").toLowerCase();
    if (band && status.toUpperCase() === "ACTIVE") {
      const first = activeBands.get(band);
      if (first) {
        issues.push({ severity: "error", message: `Active band "${textField(bird, "band")}" is duplicated by ${first} and ${label}.` });
      } else {
        activeBands.set(band, label);
      }
    }
  }

  for (const line of byKey.breeding_lines) {
    if (!textField(line, "name")) issues.push({ severity: "error", message: "A breeding line is missing a name." });
  }

  for (const period of byKey.mating_periods) {
    const label = textField(period, "label") || textField(period, "id") || "unnamed mating period";
    const lineId = textAny(period, ["breeding_line_id", "breedingLineId"]);
    if (lineId && !breedingLineIds.has(lineId)) issues.push({ severity: "error", message: `${label} references an unknown breeding line.` });
    const coopId = textAny(period, ["coop_id", "coopId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: `${label} references an unknown coop.` });
    const sireId = textAny(period, ["sire_id", "sireId"]);
    if (sireId && !birdIds.has(sireId)) issues.push({ severity: "error", message: `${label} references an unknown sire.` });
  }

  for (const hen of byKey.mating_period_hens) {
    const periodId = textAny(hen, ["mating_period_id", "matingPeriodId"]);
    const henId = textAny(hen, ["hen_id", "henId", "birdId"]);
    if (periodId && !matingPeriodIds.has(periodId)) issues.push({ severity: "error", message: "A hen group link references an unknown mating period." });
    if (henId && !birdIds.has(henId)) issues.push({ severity: "error", message: "A hen group link references an unknown hen." });
  }

  for (const cycle of byKey.incubations) {
    const label = textField(cycle, "label") || textField(cycle, "id") || "unnamed incubation";
    const periodId = textAny(cycle, ["mating_period_id", "matingPeriodId"]);
    if (periodId && !matingPeriodIds.has(periodId)) issues.push({ severity: "error", message: `${label} references an unknown mating period.` });
    const batchId = textAny(cycle, ["hatch_batch_id", "hatchBatchId"]);
    if (batchId && !hatchBatchIds.has(batchId)) issues.push({ severity: "error", message: `${label} references an unknown hatch batch.` });
    if (!textAny(cycle, ["set_date", "setDate"])) issues.push({ severity: "error", message: `${label} is missing a set date.` });
  }

  for (const batch of byKey.hatch_batches) {
    const label = textField(batch, "label") || textField(batch, "id") || "unnamed hatch batch";
    const lineId = textAny(batch, ["breeding_line_id", "breedingLineId"]);
    if (lineId && !breedingLineIds.has(lineId)) issues.push({ severity: "error", message: `${label} references an unknown breeding line.` });
    const periodId = textAny(batch, ["mating_period_id", "matingPeriodId"]);
    if (periodId && !matingPeriodIds.has(periodId)) issues.push({ severity: "error", message: `${label} references an unknown mating period.` });
  }

  for (const feed of byKey.feed_types) {
    const label = [textField(feed, "brand"), textField(feed, "name")].filter(Boolean).join(" ") || textField(feed, "id") || "unnamed feed";
    if (!textField(feed, "brand")) issues.push({ severity: "warning", message: `${label} is missing a brand.` });
    if (!textField(feed, "name")) issues.push({ severity: "error", message: `${label} is missing a feed name.` });
    if (!Number(feed.cup_weight_oz ?? feed.cupWeightOz)) issues.push({ severity: "warning", message: `${label} is missing cup weight; import would need a cup-weight assumption.` });
  }

  for (const log of [...byKey.feed_logs, ...byKey.feed_inventory_events]) {
    const feedTypeId = textAny(log, ["feed_type_id", "feedTypeId"]);
    if (feedTypeId && !feedTypeIds.has(feedTypeId)) issues.push({ severity: "error", message: "A feed record references an unknown feed type." });
  }
  for (const log of byKey.feed_logs) {
    const coopId = textAny(log, ["coop_id", "coopId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: "A feed top-off references an unknown coop." });
  }

  for (const log of byKey.egg_logs) {
    const coopId = textAny(log, ["coop_id", "coopId"]);
    const birdId = textAny(log, ["bird_id", "birdId"]);
    if (coopId && !coopIds.has(coopId)) issues.push({ severity: "error", message: "An egg log references an unknown coop." });
    if (birdId && !birdIds.has(birdId)) issues.push({ severity: "error", message: "An egg log references an unknown bird." });
  }

  for (const log of byKey.weight_logs) {
    const birdId = textAny(log, ["bird_id", "birdId"]);
    if (birdId && !birdIds.has(birdId)) issues.push({ severity: "error", message: "A weight log references an unknown bird." });
  }

  const recordCounts = sections.map(([label, key]) => ({ label, count: byKey[key].length }));
  const recordTotal = recordCounts.reduce((sum, item) => sum + item.count, 0);
  if (recordTotal === 0) {
    issues.push({ severity: "error", message: "No recognized Covey/prototype record arrays were found in this file." });
  }
  const totals = {
    records: recordTotal,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length
  };

  return { fileName, format, recordCounts, issues, totals };
}

function hasField(form: HTMLFormElement, name: string) {
  return new FormData(form).has(name);
}

function optionalNumber(form: HTMLFormElement, name: string) {
  const value = fieldValue(form, name);
  return value ? Number(value) : null;
}

function optionalDate(form: HTMLFormElement, name: string) {
  return fieldValue(form, name) || null;
}

function optionalDateTime(form: HTMLFormElement, name: string) {
  const value = fieldValue(form, name);
  return value ? new Date(value).toISOString() : undefined;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function sectionTitle(section: DashboardSection) {
  return {
    overview: "Overview",
    chores: "Chore mode",
    flock: "Your flock",
    coops: "Coops",
    cameras: "Cameras",
    eggs: "Egg production",
    feed: "Feed tracking",
    sales: "Sales",
    health: "Health",
    incubation: "Incubation",
    breeding: "Breeding lines",
    todos: "To do",
    recommendations: "Recommendations",
    calendar: "Calendar",
    reports: "Reports",
    audit: "History",
    settings: "Settings"
  }[section];
}

function themeModeLabel(mode: ThemeMode) {
  return {
    auto: "Auto",
    light: "Light",
    dark: "Dark"
  }[mode];
}

function themeModeIcon(mode: ThemeMode) {
  return {
    auto: "◐",
    light: "☼",
    dark: "☾"
  }[mode];
}

function nextThemeMode(mode: ThemeMode): ThemeMode {
  if (mode === "auto") return "light";
  if (mode === "light") return "dark";
  return "auto";
}

function normalizeThemeMode(value: unknown): ThemeMode {
  return value === "light" || value === "dark" || value === "auto" ? value : "auto";
}

function homesteadSettingsPayload(form: HTMLFormElement, extraPreferences: Record<string, unknown> = {}) {
  const preferences: Record<string, unknown> = {};
  const textFields = [
    "maleFemaleRatio",
    "feedTopOffUnit",
    "homesteadSubtitle",
    "defaultBirdView",
    "weightUnit",
    "uiMode",
    "currencyCode",
    "timeZone",
    "timeFormat",
    "dateFormat",
    "requireMfaForKeepers",
    "preferCalm",
    "weighWeeks",
    "defaultBrooderCoop",
    "autoCreateChickRecords",
    "defaultIncubatorLocation"
  ];
  const numberFields = [
    "defaultCupWeightOz",
    "incubationDays",
    "hatchDay",
    "candleDay",
    "lockdownDay",
    "hensPerRooster",
    "minProcessAgeWeeks",
    "targetLiveWeightOz",
    "minBreederRating",
    "valueTableEgg",
    "valueFertileEgg",
    "valueChick",
    "valueMeatPerOz",
    "roiStrongReturn",
    "roiPositiveReturn",
    "incubationTempF",
    "incubationHumidity",
    "lockdownTempF",
    "lockdownHumidity",
    "candleReminderLeadDays",
    "lockdownReminderLeadDays",
    "passwordMinLength",
    "sessionDurationHours",
    "rememberMeDurationDays"
  ];

  for (const field of textFields) {
    if (hasField(form, field)) preferences[field] = fieldValue(form, field);
  }

  for (const field of numberFields) {
    if (hasField(form, field)) preferences[field] = Number(fieldValue(form, field));
  }

  return {
    name: fieldValue(form, "name"),
    preferences: {
      ...preferences,
      ...extraPreferences
    }
  };
}

function displayPreference(homestead: Homestead, key: string, fallback: string | number) {
  return String(homestead.preferences[key] ?? fallback);
}

function money(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function numberValue(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function feedTypeLabel(feed: FeedType) {
  return `${feed.brand} ${feed.name}`.trim();
}

function estimatedBirdFeedCost(bird: Bird, feedLogs: FeedLog[]) {
  if (!bird.coop_id) return 0;

  return feedLogs
    .filter((log) => log.coop_id === bird.coop_id)
    .reduce((total, log) => {
      const activeBirdCount = numberValue(log.active_bird_count);
      if (!activeBirdCount) return total;
      return total + numberValue(log.cost) / activeBirdCount;
    }, 0);
}

function cupsPerBag(feed: Pick<FeedType, "bag_weight_lb" | "cup_weight_oz">) {
  return (numberValue(feed.bag_weight_lb) * 16) / numberValue(feed.cup_weight_oz);
}

function inventoryCupsFromBagCount(bagCount: string | number, bagWeightLb: string | number, cupWeightOz: string | number) {
  const bags = numberValue(bagCount);
  const pounds = numberValue(bagWeightLb);
  const ouncesPerCup = numberValue(cupWeightOz);
  if (!bags || !pounds || !ouncesPerCup) return 0;
  return (bags * pounds * 16) / ouncesPerCup;
}

function costPerCup(feed: Pick<FeedType, "bag_weight_lb" | "bag_cost" | "cup_weight_oz">) {
  return numberValue(feed.bag_cost) / cupsPerBag(feed);
}

function feedInventoryValue(feed: FeedType) {
  return numberValue(feed.inventory_cups) * costPerCup(feed);
}

function feedInventoryLabel(feed: FeedType) {
  const cups = numberValue(feed.inventory_cups);
  const bags = cupsPerBag(feed) ? cups / cupsPerBag(feed) : 0;
  return `${cups.toFixed(1)} cups · ${bags.toFixed(2)} bags`;
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCell(row[header] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function readFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function eggSourceLabel(log: EggLog) {
  if (log.bird_id) return log.bird_band || log.bird_name || "Bird record";
  if (log.coop_id) return log.coop_name || "Coop record";
  return "Whole flock";
}

function fertileRate(total: string | number | null | undefined, fertile: string | number | null | undefined) {
  const totalNumber = numberValue(total);
  if (!totalNumber || fertile == null) return null;
  return (numberValue(fertile) / totalNumber) * 100;
}

function rateLabel(value: number | null) {
  return value == null ? "Not tracked" : `${value.toFixed(1)}%`;
}

function preferenceNumber(homestead: Homestead, key: string, fallback: number) {
  const value = Number(homestead.preferences[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function eggLogValue(log: EggLog, tableEggValue: number) {
  return numberValue(log.quantity) * tableEggValue;
}

function valueRating(netValue: number, strongReturn: number, positiveReturn: number) {
  if (netValue >= strongReturn) {
    return {
      label: "Strong",
      tone: "strong",
      detail: `Net estimate is at or above the ${money(strongReturn)} strong-return threshold.`
    };
  }
  if (netValue >= positiveReturn) {
    return {
      label: "Positive",
      tone: "positive",
      detail: `Net estimate is at or above the ${money(positiveReturn)} positive-return threshold.`
    };
  }
  return {
    label: "Negative",
    tone: "negative",
    detail: `Net estimate is below the ${money(positiveReturn)} positive-return threshold.`
  };
}

function normalizeDateKey(value: string | null | undefined) {
  if (!value) return "";
  const text = String(value).trim();
  const dateMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : dateKey(parsed);
}

function displayDate(value: string | null | undefined, fallback = "Not set") {
  const key = normalizeDateKey(value);
  if (!key) return fallback;
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function dateKeyTime(value: string | null | undefined) {
  const key = normalizeDateKey(value);
  return key ? new Date(`${key}T00:00:00`).getTime() : Number.NaN;
}

function dateKeyDaysAgo(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return dateKey(date);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyAddDays(from: string, days: number) {
  const key = normalizeDateKey(from);
  if (!key) return "";
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function dateDiffDays(from: string, to: string) {
  const fromKey = normalizeDateKey(from);
  const toKey = normalizeDateKey(to);
  if (!fromKey || !toKey) return null;
  const start = new Date(`${fromKey}T00:00:00`).getTime();
  const end = new Date(`${toKey}T00:00:00`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function shiftMonth(value: string, offset: number) {
  const date = new Date(`${value}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return dateKey(date).slice(0, 7);
}

function monthLabel(value: string) {
  return new Date(`${value}-01T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
}

function monthKeyFromParts(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function calendarGridDates(value: string) {
  const firstOfMonth = new Date(`${value}-01T12:00:00`);
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return dateKey(date);
  });
}

function ageDaysOn(hatchDate: string | null, onDate: string) {
  if (!hatchDate) return null;
  const days = dateDiffDays(hatchDate, onDate);
  return days == null ? null : Math.max(0, days);
}

function ageLabelFromDays(days: number | null) {
  if (days == null) return "age unknown";
  if (days < 14) return `${days} days old`;
  return `${(days / 7).toFixed(1)} weeks old`;
}

function dateRange(from: string, to: string) {
  const fromKey = normalizeDateKey(from);
  if (!fromKey) return [];
  const diff = dateDiffDays(from, to);
  const days = Math.max(0, Math.min(90, diff ?? 0));
  return Array.from({ length: days + 1 }, (_, index) => {
    const date = new Date(`${fromKey}T00:00:00`);
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function percentComplete(startDate: string, endDate: string) {
  const total = Math.max(1, dateDiffDays(startDate, endDate) ?? 1);
  const elapsed = Math.min(total, Math.max(0, dateDiffDays(startDate, dateKeyDaysAgo(0)) ?? 0));
  return (elapsed / total) * 100;
}

function dateStatusLabel(dateValue: string | null | undefined) {
  if (!dateValue) return "Not set";
  const days = dateDiffDays(dateKeyDaysAgo(0), dateValue);
  if (days == null) return "date unavailable";
  if (days === 0) return "Today";
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} out`;
  return `${Math.abs(days)} day${days === -1 ? "" : "s"} ago`;
}

function parseWeighWeeks(homestead: Homestead) {
  const raw = String(homestead.preferences.weighWeeks ?? "1, 2, 4, 6, 8");
  return raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

function buildTodoItems({
  birds,
  healthEvents,
  homestead,
  incubations,
  weightLogs
}: {
  birds: Bird[];
  healthEvents: HealthEvent[];
  homestead: Homestead;
  incubations: Incubation[];
  weightLogs: WeightLog[];
}) {
  const today = dateKeyDaysAgo(0);
  const weighWeeks = parseWeighWeeks(homestead);
  const items: WorkItem[] = [];

  for (const cycle of incubations) {
    if (cycle.hatched_count != null) continue;

    [
      { key: "candle", title: "Candle incubation", date: cycle.candle_date },
      { key: "lockdown", title: "Move incubation to lockdown", date: cycle.lockdown_date },
      { key: "hatch", title: "Check expected hatch", date: cycle.expected_hatch_date }
    ].forEach((reminder) => {
      if (!reminder.date) return;
      const days = dateDiffDays(today, reminder.date);
      if (days == null) return;
      if (days < -2 || days > 3) return;
      items.push({
        id: `incubation-${cycle.id}-${reminder.key}`,
        title: reminder.title,
        detail: `${cycle.label} is ${dateStatusLabel(reminder.date)}.`,
        priority: days <= 0 ? "high" : "medium",
        section: "incubation",
        dueDate: reminder.date
      });
    });
  }

  for (const bird of birds.filter((candidate) => candidate.status === "ACTIVE" && candidate.hatch_date)) {
    const logs = weightLogs.filter((log) => log.bird_id === bird.id);

    for (const week of weighWeeks) {
      const targetDate = dateKeyAddDays(bird.hatch_date ?? "", week * 7);
      const daysFromTarget = dateDiffDays(targetDate, today);
      if (daysFromTarget == null) continue;
      if (daysFromTarget < 0 || daysFromTarget > 5) continue;

      const hasNearbyLog = logs.some((log) => {
        const daysFromLog = dateDiffDays(targetDate, log.weighed_on);
        return daysFromLog != null && Math.abs(daysFromLog) <= 3;
      });
      if (hasNearbyLog) continue;

      items.push({
        id: `weigh-${bird.id}-${week}`,
        title: `Weigh ${birdLabel(bird)}`,
        detail: `${week} week checkpoint was ${dateStatusLabel(targetDate)}.`,
        priority: daysFromTarget >= 2 ? "high" : "medium",
        section: "flock",
        dueDate: targetDate
      });
      break;
    }
  }

  for (const event of healthEvents.filter((candidate) => candidate.outcome !== "RESOLVED" && candidate.follow_up_on)) {
    const days = dateDiffDays(today, event.follow_up_on ?? "");
    if (days == null || days > 7) continue;
    items.push({
      id: `health-${event.id}`,
      title: `Follow up: ${event.title}`,
      detail: `${event.bird_band || event.bird_name || event.coop_name || "Health record"} is ${dateStatusLabel(event.follow_up_on)}.`,
      priority: event.severity === "CRITICAL" || event.severity === "HIGH" || days <= 0 ? "high" : "medium",
      section: "health",
      dueDate: event.follow_up_on ?? undefined
    });
  }

  return items.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

function buildRecommendationItems({
  birds,
  coops,
  homestead,
  matingPeriods
}: {
  birds: Bird[];
  coops: Coop[];
  homestead: Homestead;
  matingPeriods: MatingPeriod[];
}) {
  const activeBirds = birds.filter((bird) => bird.status === "ACTIVE");
  const targetHens = preferenceNumber(homestead, "hensPerRooster", 4);
  const targetLiveWeightOz = preferenceNumber(homestead, "targetLiveWeightOz", 8);
  const minProcessAgeWeeks = preferenceNumber(homestead, "minProcessAgeWeeks", 8);
  const today = dateKeyDaysAgo(0);
  const openSireIds = new Set(
    matingPeriods
      .filter((period) => !period.ended_on && period.sire_id)
      .map((period) => period.sire_id as string)
  );
  const items: WorkItem[] = [];
  const ageWeeks = (bird: Bird) => {
    const days = ageDaysOn(bird.hatch_date, today);
    return days == null ? null : days / 7;
  };
  const describeBirds = (candidates: Bird[]) => {
    const labels = candidates.slice(0, 3).map((bird) => birdLabel(bird));
    return labels.length ? ` Examples: ${labels.join(", ")}${candidates.length > 3 ? ", ..." : ""}.` : "";
  };

  for (const coop of coops.filter((candidate) => candidate.type === "BREEDING")) {
    const coopBirds = activeBirds.filter((bird) => bird.coop_id === coop.id);
    const males = coopBirds.filter((bird) => bird.sex === "MALE").length;
    const females = coopBirds.filter((bird) => bird.sex === "FEMALE").length;
    if (!males && !females) continue;
    if (males === 0 || females / Math.max(1, males) < targetHens) {
      items.push({
        id: `ratio-${coop.id}`,
        title: `Review breeding ratio in ${coop.name}`,
        detail: `${males} male and ${females} female active birds. Target is about 1:${targetHens}.`,
        priority: "medium",
        section: "coops"
      });
    }
  }

  for (const period of matingPeriods.filter((candidate) => !candidate.ended_on)) {
    const fertility = fertileRate(period.eggs_set, period.fertile_eggs);
    if (fertility != null && fertility < 70) {
      items.push({
        id: `fertility-${period.id}`,
        title: `Review fertility for ${period.label}`,
        detail: `${rateLabel(fertility)} fertility is below the 70% review threshold.`,
        priority: "medium",
        section: "breeding"
      });
    }
    if (!period.sire_id || numberValue(period.hen_count) === 0) {
      items.push({
        id: `lineage-${period.id}`,
        title: `Complete lineage setup for ${period.label}`,
        detail: "Sire or hen group is missing, which weakens hatch-batch lineage.",
        priority: "low",
        section: "breeding"
      });
    }
  }

  const activeMales = activeBirds.filter((bird) => bird.sex === "MALE");
  const processingCandidates = activeMales.filter((bird) => {
    const weeks = ageWeeks(bird);
    return (
      !openSireIds.has(bird.id) &&
      numberValue(bird.current_weight_oz) >= targetLiveWeightOz &&
      (weeks == null || weeks >= minProcessAgeWeeks)
    );
  });
  if (processingCandidates.length) {
    items.push({
      id: "processing-candidates",
      title: "Review processing candidates",
      detail: `${processingCandidates.length} extra male ${
        processingCandidates.length === 1 ? "bird is" : "birds are"
      } at or above ${targetLiveWeightOz} oz and old enough for the ${minProcessAgeWeeks} week processing target.${describeBirds(processingCandidates)}`,
      priority: "high",
      section: "flock"
    });
  }

  const missingWeightMales = activeMales.filter((bird) => {
    const weeks = ageWeeks(bird);
    return !openSireIds.has(bird.id) && bird.current_weight_oz == null && weeks != null && weeks >= minProcessAgeWeeks;
  });
  if (missingWeightMales.length) {
    items.push({
      id: "processing-missing-weight",
      title: "Weigh extra males for processing decisions",
      detail: `${missingWeightMales.length} extra male ${
        missingWeightMales.length === 1 ? "bird is" : "birds are"
      } past the ${minProcessAgeWeeks} week processing age but missing a current weight.${describeBirds(missingWeightMales)}`,
      priority: "medium",
      section: "flock"
    });
  }

  const extraMales = activeMales.filter(
    (bird) => !openSireIds.has(bird.id) && !processingCandidates.some((candidate) => candidate.id === bird.id)
  );
  if (extraMales.length) {
    items.push({
      id: "extra-males",
      title: "Review extra active males",
      detail: `${extraMales.length} active male ${
        extraMales.length === 1 ? "bird is" : "birds are"
      } not assigned as an open-period sire. Keep the best breeders, sell, or process extras when they reach target.${describeBirds(extraMales)}`,
      priority: "medium",
      section: "flock"
    });
  }

  const behaviorCandidates = activeBirds.filter((bird) =>
    /\b(bully|aggressive|aggression|attack|attacking|injury|injured|mean)\b/i.test(bird.notes ?? "")
  );
  if (behaviorCandidates.length) {
    items.push({
      id: "behavior-candidates",
      title: "Review behavior-based cull candidates",
      detail: `${behaviorCandidates.length} active ${
        behaviorCandidates.length === 1 ? "bird has" : "birds have"
      } notes mentioning aggression, bullying, or injury.${describeBirds(behaviorCandidates)}`,
      priority: "medium",
      section: "flock"
    });
  }

  const unknownSexBirds = activeBirds.filter((bird) => {
    const weeks = ageWeeks(bird);
    return bird.sex === "UNKNOWN" && weeks != null && weeks >= 4;
  });
  if (unknownSexBirds.length) {
    items.push({
      id: "unknown-sex",
      title: "Sex older unknown birds",
      detail: `${unknownSexBirds.length} active ${
        unknownSexBirds.length === 1 ? "bird is" : "birds are"
      } at least 4 weeks old with unknown sex. Sexing them improves breeder and processing recommendations.${describeBirds(unknownSexBirds)}`,
      priority: "low",
      section: "flock"
    });
  }

  const breederCandidates = activeBirds.filter((bird) => {
    const weeks = ageWeeks(bird);
    return (
      bird.sex === "FEMALE" &&
      bird.breeding_line_id &&
      numberValue(bird.current_weight_oz) >= targetLiveWeightOz * 0.85 &&
      (weeks == null || weeks >= minProcessAgeWeeks)
    );
  });
  if (breederCandidates.length) {
    items.push({
      id: "breeder-candidates",
      title: "Review future breeder candidates",
      detail: `${breederCandidates.length} active female ${
        breederCandidates.length === 1 ? "bird has" : "birds have"
      } line context and mature weight. Compare egg output, hatch results, and temperament before keeping replacements.${describeBirds(breederCandidates)}`,
      priority: "low",
      section: "breeding"
    });
  }

  return items.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

function priorityRank(priority: WorkItemPriority) {
  return { high: 0, medium: 1, low: 2 }[priority];
}

function normalizeCustomWorkItem(value: unknown): CustomWorkItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CustomWorkItem>;
  const priority: WorkItemPriority =
    item.priority === "high" || item.priority === "medium" || item.priority === "low" ? item.priority : "medium";
  const section: DashboardSection =
    typeof item.section === "string" && dashboardSections.includes(item.section as DashboardSection)
      ? (item.section as DashboardSection)
      : "todos";
  const dueDate = normalizeDateKey(item.dueDate);
  if (!item.id || !item.title || !dueDate) return null;

  return {
    id: String(item.id),
    title: String(item.title),
    detail: String(item.detail ?? ""),
    priority,
    dueDate,
    section,
    completedAt: item.completedAt ?? null,
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function customWorkToWorkItem(item: CustomWorkItem): WorkItem {
  return {
    id: item.id,
    title: item.title,
    detail: item.detail || "Custom keeper-added task.",
    priority: item.priority,
    section: item.section,
    dueDate: item.dueDate,
    kind: "custom"
  };
}

function createLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parameterValue(parameters: Record<string, unknown>, key: string, fallback: string | number = "") {
  return String(parameters[key] ?? fallback);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatBytes(value: number | string | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getSetupStep(homestead: Homestead, coops: Coop[]): SetupStep | null {
  const preferences = homestead.preferences;
  if (preferences.setupComplete) return null;
  if (!preferences.setupHomesteadComplete) return "homestead";
  if (!preferences.setupCoopsComplete) return "coops";
  if (!preferences.setupBirdsComplete) return "birds";
  return "finish";
}

export function App() {
  const [apiState, setApiState] = useState<ApiState>("checking");
  const [authMode, setAuthMode] = useState<AuthMode>("register");
  const [user, setUser] = useState<User | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [needsOwnerAccount, setNeedsOwnerAccount] = useState(true);
  const [pendingLogin, setPendingLogin] = useState<PendingLogin | null>(null);
  const [homestead, setHomestead] = useState<Homestead | null>(null);
  const [coops, setCoops] = useState<Coop[]>([]);
  const [birds, setBirds] = useState<Bird[]>([]);
  const [feedTypes, setFeedTypes] = useState<FeedType[]>([]);
  const [feedLogs, setFeedLogs] = useState<FeedLog[]>([]);
  const [feedInventoryEvents, setFeedInventoryEvents] = useState<FeedInventoryEvent[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [healthEvents, setHealthEvents] = useState<HealthEvent[]>([]);
  const [photoAttachments, setPhotoAttachments] = useState<PhotoAttachment[]>([]);
  const [eggLogs, setEggLogs] = useState<EggLog[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [incubations, setIncubations] = useState<Incubation[]>([]);
  const [hatchBatches, setHatchBatches] = useState<HatchBatch[]>([]);
  const [breedingLines, setBreedingLines] = useState<BreedingLine[]>([]);
  const [matingPeriods, setMatingPeriods] = useState<MatingPeriod[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const themeMode = normalizeThemeMode(homestead?.preferences.uiMode);

  const pageTitle = useMemo(() => {
    if (user && homestead && !homestead.preferences.setupComplete) return "Set up Covey";
    if (user && homestead) return homestead.name;
    return "Start your Covey homestead";
  }, [homestead, user]);
  const setupStep = user && homestead ? getSetupStep(homestead, coops) : null;
  const showTopbar = !(user && homestead && !setupStep);

  async function loadSession() {
    try {
      const bootstrap = await apiRequest<{ needsOwnerAccount: boolean }>("/auth/bootstrap");
      setNeedsOwnerAccount(bootstrap.needsOwnerAccount);
      if (!bootstrap.needsOwnerAccount) setAuthMode((mode) => (mode === "register" ? "login" : mode));
      const me = await apiRequest<{ user: User }>("/auth/me");
      setUser(me.user);
      const result = await apiRequest<{ homestead: Homestead }>("/homestead");
      setHomestead(result.homestead);
      if (me.user.role === "OWNER") {
        const usersResult = await apiRequest<{ users: ManagedUser[] }>("/auth/users");
        setManagedUsers(usersResult.users);
      } else {
        setManagedUsers([]);
      }
      const coopResult = await apiRequest<{ coops: Coop[] }>("/coops");
      setCoops(coopResult.coops);
      const birdResult = await apiRequest<{ birds: Bird[] }>("/birds");
      setBirds(birdResult.birds);
      const feedTypeResult = await apiRequest<{ feedTypes: FeedType[] }>("/feed-types");
      setFeedTypes(feedTypeResult.feedTypes);
      const feedLogResult = await apiRequest<{ feedLogs: FeedLog[] }>("/feed-logs");
      setFeedLogs(feedLogResult.feedLogs);
      const feedInventoryResult = await apiRequest<{ feedInventoryEvents: FeedInventoryEvent[] }>("/feed-inventory-events");
      setFeedInventoryEvents(feedInventoryResult.feedInventoryEvents);
      const salesResult = await apiRequest<{ sales: SaleRecord[] }>("/sales");
      setSales(salesResult.sales);
      const healthResult = await apiRequest<{ healthEvents: HealthEvent[] }>("/health-events");
      setHealthEvents(healthResult.healthEvents);
      const photoResult = await apiRequest<{ photos: PhotoAttachment[] }>("/photos");
      setPhotoAttachments(photoResult.photos);
      const eggLogResult = await apiRequest<{ eggLogs: EggLog[] }>("/egg-logs");
      setEggLogs(eggLogResult.eggLogs);
      const weightLogResult = await apiRequest<{ weightLogs: WeightLog[] }>("/weight-logs");
      setWeightLogs(weightLogResult.weightLogs);
      const incubationResult = await apiRequest<{ incubations: Incubation[] }>("/incubations");
      setIncubations(incubationResult.incubations);
      const hatchBatchResult = await apiRequest<{ hatchBatches: HatchBatch[] }>("/hatch-batches");
      setHatchBatches(hatchBatchResult.hatchBatches);
      const breedingLineResult = await apiRequest<{ breedingLines: BreedingLine[] }>("/breeding-lines");
      setBreedingLines(breedingLineResult.breedingLines);
      const matingPeriodResult = await apiRequest<{ matingPeriods: MatingPeriod[] }>("/mating-periods");
      setMatingPeriods(matingPeriodResult.matingPeriods);
      const auditResult = await apiRequest<{ auditEvents: AuditEvent[] }>("/audit-events");
      setAuditEvents(auditResult.auditEvents);
    } catch {
      setUser(null);
      setHomestead(null);
      setCoops([]);
      setBirds([]);
      setFeedTypes([]);
      setFeedLogs([]);
      setFeedInventoryEvents([]);
      setSales([]);
      setHealthEvents([]);
      setPhotoAttachments([]);
      setEggLogs([]);
      setWeightLogs([]);
      setIncubations([]);
      setHatchBatches([]);
      setBreedingLines([]);
      setMatingPeriods([]);
      setManagedUsers([]);
      setAuditEvents([]);
    }
  }

  async function loadAuditEvents() {
    const result = await apiRequest<{ auditEvents: AuditEvent[] }>("/audit-events");
    setAuditEvents(result.auditEvents);
  }

  async function loadManagedUsers() {
    if (!user || user.role !== "OWNER") {
      setManagedUsers([]);
      return;
    }
    const result = await apiRequest<{ users: ManagedUser[] }>("/auth/users");
    setManagedUsers(result.users);
  }

  async function loadCoops() {
    const result = await apiRequest<{ coops: Coop[] }>("/coops");
    setCoops(result.coops);
  }

  async function loadBirds() {
    const result = await apiRequest<{ birds: Bird[] }>("/birds");
    setBirds(result.birds);
  }

  async function loadWeightLogs() {
    const result = await apiRequest<{ weightLogs: WeightLog[] }>("/weight-logs");
    setWeightLogs(result.weightLogs);
  }

  async function loadFeed() {
    const feedTypeResult = await apiRequest<{ feedTypes: FeedType[] }>("/feed-types");
    setFeedTypes(feedTypeResult.feedTypes);
    const feedLogResult = await apiRequest<{ feedLogs: FeedLog[] }>("/feed-logs");
    setFeedLogs(feedLogResult.feedLogs);
    const feedInventoryResult = await apiRequest<{ feedInventoryEvents: FeedInventoryEvent[] }>("/feed-inventory-events");
    setFeedInventoryEvents(feedInventoryResult.feedInventoryEvents);
  }

  async function loadSales() {
    const result = await apiRequest<{ sales: SaleRecord[] }>("/sales");
    setSales(result.sales);
  }

  async function loadHealthEvents() {
    const result = await apiRequest<{ healthEvents: HealthEvent[] }>("/health-events");
    setHealthEvents(result.healthEvents);
  }

  async function loadPhotos() {
    const result = await apiRequest<{ photos: PhotoAttachment[] }>("/photos");
    setPhotoAttachments(result.photos);
  }

  async function loadEggs() {
    const result = await apiRequest<{ eggLogs: EggLog[] }>("/egg-logs");
    setEggLogs(result.eggLogs);
  }

  async function loadIncubations() {
    const result = await apiRequest<{ incubations: Incubation[] }>("/incubations");
    setIncubations(result.incubations);
    const hatchBatchResult = await apiRequest<{ hatchBatches: HatchBatch[] }>("/hatch-batches");
    setHatchBatches(hatchBatchResult.hatchBatches);
  }

  async function loadBreeding() {
    const breedingLineResult = await apiRequest<{ breedingLines: BreedingLine[] }>("/breeding-lines");
    setBreedingLines(breedingLineResult.breedingLines);
    const matingPeriodResult = await apiRequest<{ matingPeriods: MatingPeriod[] }>("/mating-periods");
    setMatingPeriods(matingPeriodResult.matingPeriods);
  }

  useEffect(() => {
    fetch(`${apiUrl}/health`, { credentials: "include" })
      .then((response) => setApiState(response.ok ? "online" : "offline"))
      .catch(() => setApiState("offline"));

    void loadSession();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  async function handleThemeModeChange(mode: ThemeMode) {
    if (!homestead) return;
    setMessage("");
    try {
      await apiRequest<{ ok: true }>("/homestead", {
        method: "PATCH",
        body: JSON.stringify({
          preferences: {
            uiMode: mode
          }
        })
      });
      const result = await apiRequest<{ homestead: Homestead }>("/homestead");
      setHomestead(result.homestead);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update theme.");
    }
  }

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      const result = await apiRequest<{ user: User }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          homesteadName: "My Covey",
          displayName: fieldValue(form, "displayName"),
          email: fieldValue(form, "email"),
          password: fieldValue(form, "password")
        })
      });

      setUser(result.user);
      setNeedsOwnerAccount(false);
      const homesteadResult = await apiRequest<{ homestead: Homestead }>("/homestead");
      setHomestead(homesteadResult.homestead);
      const usersResult = await apiRequest<{ users: ManagedUser[] }>("/auth/users");
      setManagedUsers(usersResult.users);
      await loadCoops();
      await loadBirds();
      await loadFeed();
      await loadEggs();
      await loadIncubations();
      await loadBreeding();
      setMessage("Owner account created. Now set up your covey.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  async function finishLogin(signedInUser: User) {
    setUser(signedInUser);
    setPendingLogin(null);
    const homesteadResult = await apiRequest<{ homestead: Homestead }>("/homestead");
    setHomestead(homesteadResult.homestead);
    if (signedInUser.role === "OWNER") {
      const usersResult = await apiRequest<{ users: ManagedUser[] }>("/auth/users");
      setManagedUsers(usersResult.users);
    } else {
      setManagedUsers([]);
    }
    await loadCoops();
    await loadBirds();
    await loadFeed();
    await loadEggs();
    await loadIncubations();
    await loadBreeding();
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      const email = fieldValue(form, "email");
      const password = fieldValue(form, "password");
      const rememberMe = fieldValue(form, "rememberMe") === "on";
      const result = await apiRequest<{ user?: User; mfaRequired?: boolean }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          rememberMe
        })
      });

      if (result.mfaRequired || !result.user) {
        setPendingLogin({ email, password, rememberMe });
        setAuthMode("mfa");
        setMessage("Enter the 6-digit authenticator code for this account.");
        return;
      }

      await finishLogin(result.user);
      setMessage("Signed in.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMfaLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingLogin) {
      setAuthMode("login");
      setMessage("Sign in again to continue.");
      return;
    }
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      const result = await apiRequest<{ user?: User; mfaRequired?: boolean }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          ...pendingLogin,
          mfaCode: fieldValue(form, "mfaCode")
        })
      });
      if (result.mfaRequired || !result.user) {
        setMessage("That authenticator code did not work. Try the current 6-digit code.");
        return;
      }
      await finishLogin(result.user);
      setMessage("Signed in.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not verify authenticator code.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordResetRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      const result = await apiRequest<{
        ok: true;
        message: string;
        resetToken?: string;
        resetUrl?: string;
      }>("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({
          email: fieldValue(form, "email")
        })
      });
      setResetToken(result.resetToken ?? "");
      setMessage(result.message);
      if (result.resetToken) setAuthMode("reset-complete");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start password reset.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordResetComplete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ ok: true }>("/auth/password-reset/complete", {
        method: "POST",
        body: JSON.stringify({
          token: fieldValue(form, "token"),
          password: fieldValue(form, "password")
        })
      });
      setResetToken("");
      setAuthMode("login");
      setMessage("Password updated. Sign in with the new password.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartMfaSetup() {
    setBusy(true);
    setMessage("");

    try {
      const result = await apiRequest<MfaSetup>("/auth/mfa/setup", { method: "POST" });
      setMessage("Authenticator setup started. Add the secret to your authenticator app, then verify a code.");
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start MFA setup.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleEnableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      const result = await apiRequest<{ user: User }>("/auth/mfa/enable", {
        method: "POST",
        body: JSON.stringify({
          code: fieldValue(form, "code")
        })
      });
      setUser(result.user);
      await loadManagedUsers();
      setMessage("MFA enabled for your account.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enable MFA.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisableMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      const result = await apiRequest<{ user: User }>("/auth/mfa/disable", {
        method: "POST",
        body: JSON.stringify({
          code: fieldValue(form, "code")
        })
      });
      setUser(result.user);
      await loadManagedUsers();
      setMessage("MFA disabled for your account.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disable MFA.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExportData(format: "json" | "bundle" = "json", includePhotos = true) {
    setBusy(true);
    setMessage("");

    try {
      const path = format === "bundle" ? `/data/export/bundle?photos=${includePhotos ? "true" : "false"}` : "/data/export";
      const response = await fetch(`${apiUrl}${path}`, { credentials: "include" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(body.message ?? "Could not export data.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        disposition.match(/filename="([^"]+)"/)?.[1] ??
        `covey-${format === "bundle" ? "bundle" : "export"}-${new Date().toISOString().slice(0, 10)}.${format === "bundle" ? "zip" : "json"}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage(format === "bundle" ? "Backup bundle downloaded." : "Homestead export downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export data.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportData(data: unknown, options: RestoreOptions) {
    setBusy(true);
    setMessage("");

    try {
      const result = await apiRequest<ImportResult>("/data/import", {
        method: "POST",
        body: JSON.stringify({ data, options })
      });
      await loadSession();
      const addedRecords = Object.values(result.importedCounts).reduce((sum, count) => sum + count, 0);
      const skippedRecords = Object.values(result.skippedCounts ?? {}).reduce((sum, count) => sum + count, 0);
      const beforeBirds = Number(result.comparison.before.birds ?? 0);
      const afterBirds = Number(result.comparison.after.birds ?? 0);
      const beforeEggs = Number(result.comparison.before.eggs ?? 0);
      const afterEggs = Number(result.comparison.after.eggs ?? 0);
      setMessage(
        `Import complete: ${addedRecords} records added${skippedRecords ? `, ${skippedRecords} skipped` : ""}. Birds ${beforeBirds} -> ${afterBirds}; eggs ${beforeEggs} -> ${afterEggs}.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import data.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportBundle(dataUrl: string, options: RestoreOptions) {
    setBusy(true);
    setMessage("");

    try {
      const result = await apiRequest<ImportResult>("/data/import/bundle", {
        method: "POST",
        body: JSON.stringify({ dataUrl, options })
      });
      await loadSession();
      const addedRecords = Object.values(result.importedCounts).reduce((sum, count) => sum + count, 0);
      const skippedRecords = Object.values(result.skippedCounts ?? {}).reduce((sum, count) => sum + count, 0);
      const photos = result.bundle?.photos;
      const photoSummary = photos ? ` Photos restored: ${photos.imported}${photos.skipped ? `, ${photos.skipped} skipped` : ""}.` : "";
      setMessage(`Bundle import complete: ${addedRecords} records added${skippedRecords ? `, ${skippedRecords} skipped` : ""}.${photoSummary}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import backup bundle.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ ok: true }>("/homestead", {
        method: "PATCH",
        body: JSON.stringify(homesteadSettingsPayload(form))
      });

      const result = await apiRequest<{ homestead: Homestead }>("/homestead");
      setHomestead(result.homestead);
      setMessage("Homestead settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateManagedUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ user: ManagedUser }>("/auth/users", {
        method: "POST",
        body: JSON.stringify({
          displayName: fieldValue(form, "displayName"),
          email: fieldValue(form, "email"),
          password: fieldValue(form, "password"),
          role: fieldValue(form, "role")
        })
      });
      await loadManagedUsers();
      setMessage("User account created.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create user.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateManagedUser(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      const password = fieldValue(form, "password");
      await apiRequest<{ user: ManagedUser }>(`/auth/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayName: fieldValue(form, "displayName"),
          role: fieldValue(form, "role"),
          disabled: fieldValue(form, "disabled") === "yes",
          ...(password ? { password } : {})
        })
      });
      await loadManagedUsers();
      setMessage("User account updated.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update user.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisableManagedUser(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/auth/users/${id}`, { method: "DELETE" });
      await loadManagedUsers();
      setMessage("User account disabled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disable user.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetupHomestead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ ok: true }>("/homestead", {
        method: "PATCH",
        body: JSON.stringify(homesteadSettingsPayload(form, { setupHomesteadComplete: true }))
      });

      const result = await apiRequest<{ homestead: Homestead }>("/homestead");
      setHomestead(result.homestead);
      setMessage("Homestead settings saved. Next, add your coops.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save setup.");
    } finally {
      setBusy(false);
    }
  }

  async function markSetupPreference(preferences: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>("/homestead", {
        method: "PATCH",
        body: JSON.stringify({ preferences })
      });
      const result = await apiRequest<{ homestead: Homestead }>("/homestead");
      setHomestead(result.homestead);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update setup.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>("/auth/logout", { method: "POST" });
      setUser(null);
      setHomestead(null);
      setAuthMode("login");
      setPendingLogin(null);
      setMessage("Signed out.");
      setCoops([]);
      setBirds([]);
      setFeedTypes([]);
      setFeedLogs([]);
      setFeedInventoryEvents([]);
      setSales([]);
      setHealthEvents([]);
      setEggLogs([]);
      setIncubations([]);
      setHatchBatches([]);
      setBreedingLines([]);
      setMatingPeriods([]);
      setManagedUsers([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  }

  function coopPayload(form: HTMLFormElement): {
    name: string;
    type: string;
    capacity: number | null;
    cameraRtspUrl?: string | null;
    notes: string | null;
  } {
    return {
      name: fieldValue(form, "name"),
      type: fieldValue(form, "type"),
      capacity: optionalNumber(form, "capacity"),
      cameraRtspUrl: fieldValue(form, "cameraRtspUrl") || null,
      notes: fieldValue(form, "notes") || null
    };
  }

  async function handleCreateCoop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ coop: Coop }>("/coops", {
        method: "POST",
        body: JSON.stringify(coopPayload(form))
      });

      await loadCoops();
      form.reset();
      setMessage("Coop created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create coop.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateCoop(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      const payload = coopPayload(form);
      delete payload.cameraRtspUrl;
      const cameraRtspUrl = fieldValue(form, "cameraRtspUrl");
      if (cameraRtspUrl) {
        payload.cameraRtspUrl = cameraRtspUrl;
      } else if (hasField(form, "clearCameraRtspUrl")) {
        payload.cameraRtspUrl = null;
      }

      const result = await apiRequest<{ coop: Coop; cameraSync?: { ok: boolean; message: string } | null }>(`/coops/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      await loadCoops();
      setMessage(result.cameraSync ? `Coop updated. ${result.cameraSync.message}` : "Coop updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update coop.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteCoop(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/coops/${id}`, { method: "DELETE" });
      await loadCoops();
      setMessage("Coop deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete coop.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateCoops(ids: string[], patch: Partial<Pick<Coop, "type" | "capacity">>) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ coop: Coop }>(`/coops/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadCoops();
      setMessage(`${ids.length} ${ids.length === 1 ? "coop" : "coops"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected coops.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteCoops(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(ids.map((id) => apiRequest<{ ok: true }>(`/coops/${id}`, { method: "DELETE" })));
      await loadCoops();
      setMessage(`${ids.length} ${ids.length === 1 ? "coop" : "coops"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected coops.");
    } finally {
      setBusy(false);
    }
  }

  function birdPayload(form: HTMLFormElement) {
    return {
      name: fieldValue(form, "name") || null,
      band: fieldValue(form, "band") || null,
      sex: fieldValue(form, "sex"),
      status: fieldValue(form, "status"),
      coopId: fieldValue(form, "coopId") || null,
      hatchDate: optionalDate(form, "hatchDate"),
      processedDate: optionalDate(form, "processedDate"),
      currentWeightOz: optionalNumber(form, "currentWeightOz"),
      notes: fieldValue(form, "notes") || null
    };
  }

  async function handleCreateBird(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ bird: { id: string } }>("/birds", {
        method: "POST",
        body: JSON.stringify(birdPayload(form))
      });

      await loadBirds();
      form.reset();
      setMessage("Bird created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create bird.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateBird(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ bird: { id: string } }>(`/birds/${id}`, {
        method: "PATCH",
        body: JSON.stringify(birdPayload(form))
      });

      await loadBirds();
      setMessage("Bird updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update bird.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBird(id: string) {
    setBusy(true);
    setMessage("");

    try {
      const result = await apiRequest<{ ok: true; archived?: boolean }>(`/birds/${id}`, { method: "DELETE" });
      await loadBirds();
      setMessage(result.archived ? "Bird had linked history, so it was archived and made inactive." : "Bird deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete bird.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateBirds(
    ids: string[],
    patch: Partial<Pick<Bird, "status">> & { coopId?: string | null }
  ) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ bird: { id: string } }>(`/birds/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadBirds();
      setMessage(`${ids.length} ${ids.length === 1 ? "bird" : "birds"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected birds.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteBirds(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      const results = await Promise.all(
        ids.map((id) => apiRequest<{ ok: true; archived?: boolean }>(`/birds/${id}`, { method: "DELETE" }))
      );
      await loadBirds();
      const archived = results.filter((result) => result.archived).length;
      setMessage(
        archived
          ? `${ids.length} selected ${ids.length === 1 ? "bird was" : "birds were"} processed. ${archived} ${archived === 1 ? "was" : "were"} archived because of linked history.`
          : `${ids.length} ${ids.length === 1 ? "bird" : "birds"} deleted.`
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected birds.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateWeightLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ weightLog: { id: string } }>("/weight-logs", {
        method: "POST",
        body: JSON.stringify({
          birdId: fieldValue(form, "birdId"),
          weighedOn: fieldValue(form, "weighedOn"),
          weightOz: Number(fieldValue(form, "weightOz")),
          notes: fieldValue(form, "notes") || null
        })
      });

      await loadBirds();
      await loadWeightLogs();
      form.reset();
      setMessage("Weight logged.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not log weight.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWeightLog(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/weight-logs/${id}`, { method: "DELETE" });
      await loadBirds();
      await loadWeightLogs();
      setMessage("Weight log deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete weight log.");
    } finally {
      setBusy(false);
    }
  }

  function feedTypePayload(form: HTMLFormElement) {
    const bagWeightLb = Number(fieldValue(form, "bagWeightLb"));
    const cupWeightOz = Number(fieldValue(form, "cupWeightOz") || 8);
    const manualInventoryCups = optionalNumber(form, "inventoryCups");
    const initialBagCount = optionalNumber(form, "initialBagCount");

    return {
      brand: fieldValue(form, "brand"),
      name: fieldValue(form, "name"),
      vendor: fieldValue(form, "vendor") || null,
      proteinPercent: optionalNumber(form, "proteinPercent"),
      bagWeightLb,
      bagCost: Number(fieldValue(form, "bagCost")),
      cupWeightOz,
      inventoryCups:
        manualInventoryCups ??
        (initialBagCount == null ? 0 : inventoryCupsFromBagCount(initialBagCount, bagWeightLb, cupWeightOz)),
      active: fieldValue(form, "active") !== "false"
    };
  }

  function feedLogPayload(form: HTMLFormElement) {
    return {
      coopId: fieldValue(form, "coopId"),
      feedTypeId: fieldValue(form, "feedTypeId"),
      loggedAt: optionalDateTime(form, "loggedAt"),
      amount: Number(fieldValue(form, "amount")),
      unit: fieldValue(form, "unit"),
      notes: fieldValue(form, "notes") || null
    };
  }

  function feedInventoryPayload(form: HTMLFormElement) {
    return {
      feedTypeId: fieldValue(form, "feedTypeId"),
      loggedAt: optionalDateTime(form, "loggedAt"),
      amount: Number(fieldValue(form, "amount")),
      unit: fieldValue(form, "unit"),
      cost: optionalNumber(form, "cost"),
      notes: fieldValue(form, "notes") || null
    };
  }

  async function handleCreateFeedType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ feedType: { id: string } }>("/feed-types", {
        method: "POST",
        body: JSON.stringify(feedTypePayload(form))
      });
      await loadFeed();
      form.reset();
      setMessage("Feed created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create feed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateFeedType(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ feedType: { id: string } }>(`/feed-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(feedTypePayload(form))
      });
      await loadFeed();
      setMessage("Feed updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update feed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFeedType(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/feed-types/${id}`, { method: "DELETE" });
      await loadFeed();
      setMessage("Feed deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete feed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateFeedTypes(ids: string[], patch: Record<string, unknown>) {
    if (!ids.length || !Object.keys(patch).length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ feedType: { id: string } }>(`/feed-types/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadFeed();
      setMessage(`${ids.length} ${ids.length === 1 ? "feed" : "feeds"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected feeds.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteFeedTypes(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(ids.map((id) => apiRequest<{ ok: true }>(`/feed-types/${id}`, { method: "DELETE" })));
      await loadFeed();
      setMessage(`${ids.length} ${ids.length === 1 ? "feed" : "feeds"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected feeds.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFeedInventoryEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ feedInventoryEvent: { id: string } }>("/feed-inventory-events", {
        method: "POST",
        body: JSON.stringify(feedInventoryPayload(form))
      });
      await loadFeed();
      form.reset();
      setMessage("Feed restock logged.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not log feed restock.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateFeedInventoryEvent(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ feedInventoryEvent: { id: string } }>(`/feed-inventory-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(feedInventoryPayload(form))
      });
      await loadFeed();
      setMessage("Feed restock updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update feed restock.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFeedInventoryEvent(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/feed-inventory-events/${id}`, { method: "DELETE" });
      await loadFeed();
      setMessage("Feed restock deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete feed restock.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateFeedInventoryEvents(ids: string[], patch: Record<string, unknown>) {
    if (!ids.length || !Object.keys(patch).length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ feedInventoryEvent: { id: string } }>(`/feed-inventory-events/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadFeed();
      setMessage(`${ids.length} ${ids.length === 1 ? "restock" : "restocks"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected restocks.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteFeedInventoryEvents(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(ids.map((id) => apiRequest<{ ok: true }>(`/feed-inventory-events/${id}`, { method: "DELETE" })));
      await loadFeed();
      setMessage(`${ids.length} ${ids.length === 1 ? "restock" : "restocks"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected restocks.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFeedLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ feedLog: { id: string } }>("/feed-logs", {
        method: "POST",
        body: JSON.stringify(feedLogPayload(form))
      });
      await loadFeed();
      form.reset();
      setMessage("Feed top-off logged.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not log feed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateFeedLog(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ feedLog: { id: string } }>(`/feed-logs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(feedLogPayload(form))
      });
      await loadFeed();
      setMessage("Feed log updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update feed log.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFeedLog(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/feed-logs/${id}`, { method: "DELETE" });
      await loadFeed();
      setMessage("Feed log deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete feed log.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateFeedLogs(ids: string[], patch: Record<string, unknown>) {
    if (!ids.length || !Object.keys(patch).length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ feedLog: { id: string } }>(`/feed-logs/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadFeed();
      setMessage(`${ids.length} ${ids.length === 1 ? "feed log" : "feed logs"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected feed logs.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteFeedLogs(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(ids.map((id) => apiRequest<{ ok: true }>(`/feed-logs/${id}`, { method: "DELETE" })));
      await loadFeed();
      setMessage(`${ids.length} ${ids.length === 1 ? "feed log" : "feed logs"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected feed logs.");
    } finally {
      setBusy(false);
    }
  }

  function salePayload(form: HTMLFormElement) {
    return {
      soldOn: fieldValue(form, "soldOn"),
      itemType: fieldValue(form, "itemType"),
      quantity: Number(fieldValue(form, "quantity")),
      unit: fieldValue(form, "unit") || "each",
      unitPrice: Number(fieldValue(form, "unitPrice")),
      buyer: fieldValue(form, "buyer") || null,
      coopId: fieldValue(form, "coopId") || null,
      birdId: fieldValue(form, "birdId") || null,
      breedingLineId: fieldValue(form, "breedingLineId") || null,
      matingPeriodId: fieldValue(form, "matingPeriodId") || null,
      incubationId: fieldValue(form, "incubationId") || null,
      hatchBatchId: fieldValue(form, "hatchBatchId") || null,
      notes: fieldValue(form, "notes") || null
    };
  }

  async function handleCreateSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ sale: { id: string } }>("/sales", {
        method: "POST",
        body: JSON.stringify(salePayload(form))
      });
      await loadSales();
      form.reset();
      setMessage("Sale recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record sale.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSale(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ sale: { id: string } }>(`/sales/${id}`, {
        method: "PATCH",
        body: JSON.stringify(salePayload(form))
      });
      await loadSales();
      setMessage("Sale updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update sale.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteSale(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/sales/${id}`, { method: "DELETE" });
      await loadSales();
      setMessage("Sale deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete sale.");
    } finally {
      setBusy(false);
    }
  }

  function healthEventPayload(form: HTMLFormElement) {
    return {
      birdId: fieldValue(form, "birdId") || null,
      coopId: fieldValue(form, "coopId") || null,
      observedOn: fieldValue(form, "observedOn"),
      eventType: fieldValue(form, "eventType"),
      severity: fieldValue(form, "severity"),
      outcome: fieldValue(form, "outcome"),
      title: fieldValue(form, "title"),
      notes: fieldValue(form, "notes") || null,
      treatment: fieldValue(form, "treatment") || null,
      followUpOn: optionalDate(form, "followUpOn")
    };
  }

  async function handleCreateHealthEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ healthEvent: { id: string } }>("/health-events", {
        method: "POST",
        body: JSON.stringify(healthEventPayload(form))
      });
      await loadHealthEvents();
      form.reset();
      setMessage("Health record created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create health record.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateHealthEvent(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ healthEvent: { id: string } }>(`/health-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(healthEventPayload(form))
      });
      await loadHealthEvents();
      setMessage("Health record updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update health record.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteHealthEvent(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/health-events/${id}`, { method: "DELETE" });
      await loadHealthEvents();
      setMessage("Health record deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete health record.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      const fileInput = form.elements.namedItem("photo") as HTMLInputElement | null;
      const file = fileInput?.files?.[0];
      if (!file) throw new Error("Choose a photo first.");
      if (!file.type.startsWith("image/")) throw new Error("Photo must be an image file.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Photos must be 5 MB or smaller.");
      const dataUrl = await readFileDataUrl(file);
      await apiRequest<{ photo: { id: string } }>("/photos", {
        method: "POST",
        body: JSON.stringify({
          entityType: fieldValue(form, "entityType"),
          entityId: fieldValue(form, "entityId"),
          fileName: file.name,
          mimeType: file.type,
          dataUrl
        })
      });
      await loadPhotos();
      form.reset();
      setMessage("Photo added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add photo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePhoto(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/photos/${id}`, { method: "DELETE" });
      await loadPhotos();
      setMessage("Photo deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete photo.");
    } finally {
      setBusy(false);
    }
  }

  function eggLogPayload(form: HTMLFormElement) {
    return {
      coopId: fieldValue(form, "coopId") || null,
      birdId: fieldValue(form, "birdId") || null,
      loggedOn: fieldValue(form, "loggedOn"),
      quantity: Number(fieldValue(form, "quantity")),
      notes: fieldValue(form, "notes") || null
    };
  }

  async function handleCreateEggLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ eggLog: { id: string } }>("/egg-logs", {
        method: "POST",
        body: JSON.stringify(eggLogPayload(form))
      });
      await loadEggs();
      form.reset();
      setMessage("Egg log created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create egg log.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateEggLog(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ eggLog: { id: string } }>(`/egg-logs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(eggLogPayload(form))
      });
      await loadEggs();
      setMessage("Egg log updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update egg log.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteEggLog(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/egg-logs/${id}`, { method: "DELETE" });
      await loadEggs();
      setMessage("Egg log deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete egg log.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateEggLogs(ids: string[], patch: Record<string, unknown>) {
    if (!ids.length || !Object.keys(patch).length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ eggLog: { id: string } }>(`/egg-logs/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadEggs();
      setMessage(`${ids.length} ${ids.length === 1 ? "egg log" : "egg logs"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected egg logs.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteEggLogs(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(ids.map((id) => apiRequest<{ ok: true }>(`/egg-logs/${id}`, { method: "DELETE" })));
      await loadEggs();
      setMessage(`${ids.length} ${ids.length === 1 ? "egg log" : "egg logs"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected egg logs.");
    } finally {
      setBusy(false);
    }
  }

  function incubationPayload(form: HTMLFormElement) {
    return {
      matingPeriodId: fieldValue(form, "matingPeriodId") || null,
      label: fieldValue(form, "label"),
      setDate: fieldValue(form, "setDate"),
      eggsSet: Number(fieldValue(form, "eggsSet")),
      fertileEggs: optionalNumber(form, "fertileEggs"),
      hatchedCount: optionalNumber(form, "hatchedCount"),
      candleDate: optionalDate(form, "candleDate"),
      lockdownDate: optionalDate(form, "lockdownDate"),
      expectedHatchDate: optionalDate(form, "expectedHatchDate"),
      parameters: {
        incubationTempF: optionalNumber(form, "incubationTempF"),
        incubationHumidity: optionalNumber(form, "incubationHumidity"),
        lockdownTempF: optionalNumber(form, "lockdownTempF"),
        lockdownHumidity: optionalNumber(form, "lockdownHumidity")
      },
      notes: fieldValue(form, "notes") || null
    };
  }

  async function handleCreateIncubation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      const payload = incubationPayload(form);
      const response = await apiRequest<{ incubation: { id: string } }>("/incubations", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (payload.hatchedCount != null) {
        await apiRequest<{ hatchBatch: { id: string } }>(`/incubations/${response.incubation.id}/hatch-batch`, {
          method: "POST",
          body: JSON.stringify({ createChicks: homestead ? displayPreference(homestead, "autoCreateChickRecords", "yes") !== "no" : true })
        });
      }
      await loadIncubations();
      await loadBreeding();
      form.reset();
      setMessage(payload.hatchedCount != null ? "Incubation cycle and hatch batch created." : "Incubation cycle created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create incubation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateIncubation(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      const payload = incubationPayload(form);
      const existing = incubations.find((cycle) => cycle.id === id);
      await apiRequest<{ incubation: { id: string } }>(`/incubations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      const shouldCreateHatchBatch = payload.hatchedCount != null && !existing?.hatch_batch_id;
      if (shouldCreateHatchBatch) {
        await apiRequest<{ hatchBatch: { id: string } }>(`/incubations/${id}/hatch-batch`, {
          method: "POST",
          body: JSON.stringify({ createChicks: homestead ? displayPreference(homestead, "autoCreateChickRecords", "yes") !== "no" : true })
        });
      }
      await loadIncubations();
      await loadBreeding();
      setMessage(shouldCreateHatchBatch ? "Incubation cycle updated and hatch batch created." : "Incubation cycle updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update incubation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteIncubation(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/incubations/${id}`, { method: "DELETE" });
      await loadIncubations();
      await loadBreeding();
      setMessage("Incubation cycle deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete incubation.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateIncubations(ids: string[], patch: Record<string, unknown>) {
    if (!ids.length || !Object.keys(patch).length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ incubation: { id: string } }>(`/incubations/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadIncubations();
      await loadBreeding();
      setMessage(`${ids.length} ${ids.length === 1 ? "incubation cycle" : "incubation cycles"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected incubation cycles.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteIncubations(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(ids.map((id) => apiRequest<{ ok: true }>(`/incubations/${id}`, { method: "DELETE" })));
      await loadIncubations();
      await loadBreeding();
      setMessage(`${ids.length} ${ids.length === 1 ? "incubation cycle" : "incubation cycles"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected incubation cycles.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateHatchBatch(incubation: Incubation, createChicks: boolean) {
    setBusy(true);
    setMessage("");

    try {
      const result = await apiRequest<{ hatchBatch: { id: string; chickCount: number } }>(
        `/incubations/${incubation.id}/hatch-batch`,
        {
          method: "POST",
          body: JSON.stringify({
            createChicks,
            label: `${incubation.label} hatch`
          })
        }
      );
      await loadIncubations();
      await loadBirds();
      await loadBreeding();
      setMessage(
        result.hatchBatch.chickCount
          ? `Hatch batch created with ${result.hatchBatch.chickCount} chick records.`
          : "Hatch batch created."
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create hatch batch.");
    } finally {
      setBusy(false);
    }
  }

  function breedingLinePayload(form: HTMLFormElement) {
    return {
      name: fieldValue(form, "name"),
      goal: fieldValue(form, "goal") || null,
      notes: fieldValue(form, "notes") || null,
      active: fieldValue(form, "active") !== "false"
    };
  }

  async function handleCreateBreedingLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ breedingLine: { id: string } }>("/breeding-lines", {
        method: "POST",
        body: JSON.stringify(breedingLinePayload(form))
      });
      await loadBreeding();
      form.reset();
      setMessage("Breeding line created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create breeding line.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateBreedingLine(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ breedingLine: { id: string } }>(`/breeding-lines/${id}`, {
        method: "PATCH",
        body: JSON.stringify(breedingLinePayload(form))
      });
      await loadBreeding();
      setMessage("Breeding line updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update breeding line.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBreedingLine(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/breeding-lines/${id}`, { method: "DELETE" });
      await loadBreeding();
      setMessage("Breeding line deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete breeding line.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateBreedingLines(ids: string[], patch: Record<string, unknown>) {
    if (!ids.length || !Object.keys(patch).length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ breedingLine: { id: string } }>(`/breeding-lines/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadBreeding();
      setMessage(`${ids.length} ${ids.length === 1 ? "breeding line" : "breeding lines"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected breeding lines.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteBreedingLines(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(ids.map((id) => apiRequest<{ ok: true }>(`/breeding-lines/${id}`, { method: "DELETE" })));
      await loadBreeding();
      setMessage(`${ids.length} ${ids.length === 1 ? "breeding line" : "breeding lines"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected breeding lines.");
    } finally {
      setBusy(false);
    }
  }

  function matingPeriodPayload(form: HTMLFormElement) {
    return {
      breedingLineId: fieldValue(form, "breedingLineId"),
      coopId: fieldValue(form, "coopId") || null,
      sireId: fieldValue(form, "sireId") || null,
      henIds: fieldValues(form, "henIds"),
      label: fieldValue(form, "label"),
      startedOn: fieldValue(form, "startedOn"),
      endedOn: optionalDate(form, "endedOn"),
      notes: fieldValue(form, "notes") || null
    };
  }

  async function handleCreateMatingPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const form = event.currentTarget;
      await apiRequest<{ matingPeriod: { id: string } }>("/mating-periods", {
        method: "POST",
        body: JSON.stringify(matingPeriodPayload(form))
      });
      await loadBreeding();
      form.reset();
      setMessage("Mating period created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create mating period.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateMatingPeriod(id: string, form: HTMLFormElement) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ matingPeriod: { id: string } }>(`/mating-periods/${id}`, {
        method: "PATCH",
        body: JSON.stringify(matingPeriodPayload(form))
      });
      await loadBreeding();
      await loadIncubations();
      setMessage("Mating period updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update mating period.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMatingPeriod(id: string) {
    setBusy(true);
    setMessage("");

    try {
      await apiRequest<{ ok: true }>(`/mating-periods/${id}`, { method: "DELETE" });
      await loadBreeding();
      await loadIncubations();
      setMessage("Mating period deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete mating period.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkUpdateMatingPeriods(ids: string[], patch: Record<string, unknown>) {
    if (!ids.length || !Object.keys(patch).length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(
        ids.map((id) =>
          apiRequest<{ matingPeriod: { id: string } }>(`/mating-periods/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch)
          })
        )
      );
      await loadBreeding();
      await loadIncubations();
      setMessage(`${ids.length} ${ids.length === 1 ? "mating period" : "mating periods"} updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update selected mating periods.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkDeleteMatingPeriods(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setMessage("");

    try {
      await Promise.all(ids.map((id) => apiRequest<{ ok: true }>(`/mating-periods/${id}`, { method: "DELETE" })));
      await loadBreeding();
      await loadIncubations();
      setMessage(`${ids.length} ${ids.length === 1 ? "mating period" : "mating periods"} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete selected mating periods.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`page ${showTopbar ? "" : "app-page"}`}>
      {showTopbar ? (
        <header className="topbar">
          <div>
            <p className="eyebrow">Covey</p>
            <h1>{pageTitle}</h1>
          </div>
          <div className={`status ${apiState}`}>
            API: <strong>{apiState}</strong>
          </div>
        </header>
      ) : null}

      {message ? <div className="notice">{message}</div> : null}

      {user && homestead ? (
        setupStep ? (
          <SetupFlow
            birds={birds}
            busy={busy}
            coops={coops}
            homestead={homestead}
            step={setupStep}
            onCreateBird={handleCreateBird}
            onCreateCoop={handleCreateCoop}
            onDeleteBird={handleDeleteBird}
            onDeleteCoop={handleDeleteCoop}
            onFinish={() =>
              markSetupPreference(
                { setupBirdsComplete: true, setupComplete: true },
                "Setup complete. Welcome to your dashboard."
              )
            }
            onLogout={handleLogout}
            onSetupHomestead={handleSetupHomestead}
            onSkipBirds={() =>
              markSetupPreference(
                { setupBirdsComplete: true },
                "Starter birds skipped. You can add birds any time."
              )
            }
            onSkipCoops={() =>
              markSetupPreference(
                { setupCoopsComplete: true },
                "Coop setup saved. Next, add starter birds if you want."
              )
            }
            onUpdateBird={handleUpdateBird}
            onUpdateCoop={handleUpdateCoop}
          />
        ) : (
	          <Dashboard
        auditEvents={auditEvents}
	        busy={busy}
        birds={birds}
        breedingLines={breedingLines}
        coops={coops}
        eggLogs={eggLogs}
        feedInventoryEvents={feedInventoryEvents}
        feedLogs={feedLogs}
        feedTypes={feedTypes}
        sales={sales}
        healthEvents={healthEvents}
        photoAttachments={photoAttachments}
        hatchBatches={hatchBatches}
        homestead={homestead}
        incubations={incubations}
        managedUsers={managedUsers}
        matingPeriods={matingPeriods}
        weightLogs={weightLogs}
        themeMode={themeMode}
        user={user}
        onCreateCoop={handleCreateCoop}
        onCreateBird={handleCreateBird}
        onCreateBreedingLine={handleCreateBreedingLine}
        onCreateEggLog={handleCreateEggLog}
        onCreateFeedInventoryEvent={handleCreateFeedInventoryEvent}
        onCreateFeedLog={handleCreateFeedLog}
        onCreateFeedType={handleCreateFeedType}
        onCreateSale={handleCreateSale}
        onCreateHealthEvent={handleCreateHealthEvent}
        onCreateHatchBatch={handleCreateHatchBatch}
        onCreateIncubation={handleCreateIncubation}
        onCreateMatingPeriod={handleCreateMatingPeriod}
        onCreateManagedUser={handleCreateManagedUser}
        onCreateWeightLog={handleCreateWeightLog}
        onDeleteBird={handleDeleteBird}
        onDeleteBreedingLine={handleDeleteBreedingLine}
        onDeleteCoop={handleDeleteCoop}
        onBulkDeleteBirds={handleBulkDeleteBirds}
        onBulkDeleteCoops={handleBulkDeleteCoops}
        onBulkDeleteEggLogs={handleBulkDeleteEggLogs}
        onBulkDeleteFeedInventoryEvents={handleBulkDeleteFeedInventoryEvents}
        onBulkDeleteFeedLogs={handleBulkDeleteFeedLogs}
        onBulkDeleteFeedTypes={handleBulkDeleteFeedTypes}
        onBulkDeleteIncubations={handleBulkDeleteIncubations}
        onBulkDeleteBreedingLines={handleBulkDeleteBreedingLines}
        onBulkDeleteMatingPeriods={handleBulkDeleteMatingPeriods}
        onBulkUpdateBirds={handleBulkUpdateBirds}
        onBulkUpdateCoops={handleBulkUpdateCoops}
        onBulkUpdateEggLogs={handleBulkUpdateEggLogs}
        onBulkUpdateFeedInventoryEvents={handleBulkUpdateFeedInventoryEvents}
        onBulkUpdateFeedLogs={handleBulkUpdateFeedLogs}
        onBulkUpdateFeedTypes={handleBulkUpdateFeedTypes}
        onBulkUpdateIncubations={handleBulkUpdateIncubations}
        onBulkUpdateBreedingLines={handleBulkUpdateBreedingLines}
        onBulkUpdateMatingPeriods={handleBulkUpdateMatingPeriods}
            onDeleteEggLog={handleDeleteEggLog}
            onDeleteFeedInventoryEvent={handleDeleteFeedInventoryEvent}
        onDeleteFeedLog={handleDeleteFeedLog}
        onDeleteFeedType={handleDeleteFeedType}
        onDeleteSale={handleDeleteSale}
        onDeleteHealthEvent={handleDeleteHealthEvent}
        onDeletePhoto={handleDeletePhoto}
        onDeleteIncubation={handleDeleteIncubation}
        onDeleteMatingPeriod={handleDeleteMatingPeriod}
        onDisableManagedUser={handleDisableManagedUser}
	        onDeleteWeightLog={handleDeleteWeightLog}
	        onDisableMfa={handleDisableMfa}
	        onEnableMfa={handleEnableMfa}
	        onExportData={handleExportData}
	        onImportBundle={handleImportBundle}
	        onImportData={handleImportData}
        onLoadAuditEvents={loadAuditEvents}
	        onLogout={handleLogout}
        onSettings={handleSettings}
        onStartMfaSetup={handleStartMfaSetup}
        onThemeModeChange={handleThemeModeChange}
        onUpdateCoop={handleUpdateCoop}
        onUpdateBird={handleUpdateBird}
        onUpdateBreedingLine={handleUpdateBreedingLine}
        onUpdateEggLog={handleUpdateEggLog}
        onUpdateFeedInventoryEvent={handleUpdateFeedInventoryEvent}
        onUpdateFeedLog={handleUpdateFeedLog}
        onUpdateFeedType={handleUpdateFeedType}
        onUpdateSale={handleUpdateSale}
        onUpdateHealthEvent={handleUpdateHealthEvent}
        onCreatePhoto={handleCreatePhoto}
        onUpdateIncubation={handleUpdateIncubation}
        onUpdateMatingPeriod={handleUpdateMatingPeriod}
        onUpdateManagedUser={handleUpdateManagedUser}
      />
        )
      ) : (
        <AuthPanel
          authMode={authMode}
          busy={busy}
          needsOwnerAccount={needsOwnerAccount}
          pendingLoginEmail={pendingLogin?.email ?? ""}
          resetToken={resetToken}
          onLogin={handleLogin}
          onMfaLogin={handleMfaLogin}
          onPasswordResetComplete={handlePasswordResetComplete}
          onPasswordResetRequest={handlePasswordResetRequest}
          onRegister={handleRegister}
          onSwitchMode={(mode) => {
            if (mode !== "mfa") setPendingLogin(null);
            setAuthMode(mode);
          }}
        />
      )}
    </main>
  );
}

function AuthPanel({
  authMode,
  busy,
  needsOwnerAccount,
  pendingLoginEmail,
  resetToken,
  onLogin,
  onMfaLogin,
  onPasswordResetComplete,
  onPasswordResetRequest,
  onRegister,
  onSwitchMode
}: {
  authMode: AuthMode;
  busy: boolean;
  needsOwnerAccount: boolean;
  pendingLoginEmail: string;
  resetToken: string;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onMfaLogin: (event: FormEvent<HTMLFormElement>) => void;
  onPasswordResetComplete: (event: FormEvent<HTMLFormElement>) => void;
  onPasswordResetRequest: (event: FormEvent<HTMLFormElement>) => void;
  onRegister: (event: FormEvent<HTMLFormElement>) => void;
  onSwitchMode: (mode: AuthMode) => void;
}) {
  return (
    <section className="panel auth-layout">
      <div>
        <p className="eyebrow">Production foundation</p>
        <h2>{needsOwnerAccount ? "Create the owner account first." : "Sign in to your Covey."}</h2>
        <p className="lede">
          {needsOwnerAccount
            ? "This first screen creates the first owner for this single-homestead install. After that, owners invite additional users from Settings."
            : "This install already has an owner account. Use Sign in, or ask an owner to invite additional users."}
        </p>
        <div className="pill-row">
          <span>Postgres-backed</span>
          <span>Docker deployable</span>
          <span>Secure sessions</span>
        </div>
      </div>

      <div className="card">
        <div className="tabs" role="tablist" aria-label="Authentication mode">
          {needsOwnerAccount ? (
            <button
              className={authMode === "register" ? "active" : ""}
              type="button"
              onClick={() => onSwitchMode("register")}
            >
              Create account
            </button>
          ) : null}
          <button
            className={authMode === "login" || authMode === "mfa" ? "active" : ""}
            type="button"
            onClick={() => onSwitchMode("login")}
          >
            Sign in
          </button>
          <button
            className={authMode === "reset-request" || authMode === "reset-complete" ? "active" : ""}
            type="button"
            onClick={() => onSwitchMode("reset-request")}
          >
            Reset password
          </button>
        </div>

        {authMode === "register" && needsOwnerAccount ? (
          <form className="form" onSubmit={onRegister}>
            <label>
              Your name
              <input name="displayName" required placeholder="Owner name" />
            </label>
            <label>
              Email
              <input name="email" required type="email" placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input name="password" required type="password" minLength={12} />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Creating..." : "Create homestead"}
            </button>
          </form>
        ) : null}

        {authMode === "login" ? (
          <form className="form auth-step" onSubmit={onLogin}>
            <label>
              Email
              <input name="email" required type="email" placeholder="you@example.com" />
            </label>
            <label>
              Password
              <input name="password" required type="password" />
            </label>
            <label className="check-row">
              <input name="rememberMe" type="checkbox" />
              Remember me on this device
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <button className="link-button" type="button" onClick={() => onSwitchMode("reset-request")}>
              Forgot password?
            </button>
          </form>
        ) : null}

        {authMode === "mfa" ? (
          <form className="form auth-step mfa-step" onSubmit={onMfaLogin}>
            <p className="muted">
              MFA is enabled for {pendingLoginEmail || "this account"}. Enter the current 6-digit code from your authenticator app.
            </p>
            <label>
              Authenticator code
              <input name="mfaCode" required autoFocus inputMode="numeric" pattern="[0-9]{6}" placeholder="123456" />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Verifying..." : "Verify and sign in"}
            </button>
            <button className="link-button" type="button" onClick={() => onSwitchMode("login")}>
              Back to password
            </button>
          </form>
        ) : null}

        {authMode === "reset-request" ? (
          <form className="form" onSubmit={onPasswordResetRequest}>
            <p className="muted">
              Enter the account email. Email delivery is not wired yet, so Covey will show a one-time token for local use.
            </p>
            <label>
              Email
              <input name="email" required type="email" placeholder="you@example.com" />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Creating reset..." : "Create reset token"}
            </button>
          </form>
        ) : null}

        {authMode === "reset-complete" ? (
          <form className="form" onSubmit={onPasswordResetComplete}>
            <label>
              Reset token
              <input name="token" required defaultValue={resetToken} placeholder="Paste reset token" />
            </label>
            <label>
              New password
              <input name="password" required type="password" minLength={12} />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Updating..." : "Set new password"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function SetupFlow({
  birds,
  busy,
  coops,
  homestead,
  step,
  onCreateBird,
  onCreateCoop,
  onDeleteBird,
  onDeleteCoop,
  onFinish,
  onLogout,
  onSetupHomestead,
  onSkipBirds,
  onSkipCoops,
  onUpdateBird,
  onUpdateCoop
}: {
  birds: Bird[];
  busy: boolean;
  coops: Coop[];
  homestead: Homestead;
  step: SetupStep;
  onCreateBird: (event: FormEvent<HTMLFormElement>) => void;
  onCreateCoop: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteBird: (id: string) => void;
  onDeleteCoop: (id: string) => void;
  onFinish: () => void;
  onLogout: () => void;
  onSetupHomestead: (event: FormEvent<HTMLFormElement>) => void;
  onSkipBirds: () => void;
  onSkipCoops: () => void;
  onUpdateBird: (id: string, form: HTMLFormElement) => void;
  onUpdateCoop: (id: string, form: HTMLFormElement) => void;
}) {
  return (
    <div className="setup">
      <section className="panel setup-hero">
        <div>
          <p className="eyebrow">First install setup</p>
          <h2>{setupTitle(step)}</h2>
          <p className="lede">{setupDescription(step)}</p>
        </div>
        <div className="setup-actions">
          <SetupProgress step={step} />
          <button className="secondary" disabled={busy} type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </section>

      {step === "homestead" ? (
        <section className="panel">
          <p className="eyebrow">Step 2 of 5</p>
          <h2>Create your covey</h2>
          <form className="settings-grid" onSubmit={onSetupHomestead}>
            <HomesteadSettingsFields homestead={homestead} />
            <button disabled={busy} type="submit">
              {busy ? "Saving..." : "Save and continue"}
            </button>
          </form>
        </section>
      ) : null}

      {step === "coops" ? (
        <>
          <CoopManager
            busy={busy}
            coops={coops}
            onCreateCoop={onCreateCoop}
            onDeleteCoop={onDeleteCoop}
            onUpdateCoop={onUpdateCoop}
          />
          <section className="panel setup-footer">
            <div>
              <h2>{coops.length ? "Coops are ready." : "No coops yet."}</h2>
              <p className="muted">
                {coops.length
                  ? "Continue when your starter housing is entered."
                  : "You can skip this for now, but birds, feed, eggs, and breeding work better with coops."}
              </p>
            </div>
            <button disabled={busy} type="button" onClick={onSkipCoops}>
              {coops.length ? "Continue to birds" : "Skip coops for now"}
            </button>
          </section>
        </>
      ) : null}

      {step === "birds" ? (
        <>
          <BirdManager
            birds={birds}
            busy={busy}
            coops={coops}
            onCreateBird={onCreateBird}
            onDeleteBird={onDeleteBird}
            onUpdateBird={onUpdateBird}
          />
          <section className="panel setup-footer">
            <div>
              <h2>{birds.length ? "Starter flock entered." : "Birds can wait."}</h2>
              <p className="muted">
                Add a few birds now, or skip and import/add them later from the dashboard.
              </p>
            </div>
            <button disabled={busy} type="button" onClick={onSkipBirds}>
              {birds.length ? "Continue" : "Skip starter birds"}
            </button>
          </section>
        </>
      ) : null}

      {step === "finish" ? (
        <section className="panel setup-finish">
          <p className="eyebrow">Step 5 of 5</p>
          <h2>Setup is ready.</h2>
          <p className="lede">
            You have the foundation in place. The dashboard will keep these same sections available,
            and the next build slice can add feed tracking on top of these records.
          </p>
          <div className="setup-summary">
            <span>{coops.length} coops</span>
            <span>{birds.length} birds</span>
            <span>{homestead.name}</span>
          </div>
          <button disabled={busy} type="button" onClick={onFinish}>
            Go to dashboard
          </button>
        </section>
      ) : null}
    </div>
  );
}

function HomesteadSettingsFields({
  homestead,
  includeIncubation = true
}: {
  homestead: Homestead;
  includeIncubation?: boolean;
}) {
  const preferences = homestead.preferences;

  return (
    <>
      <label>
        Covey name
        <input name="name" required defaultValue={homestead.name} placeholder="Pine Hill Quail" />
      </label>
      <label>
        Breeding ratio
        <input
          name="maleFemaleRatio"
          defaultValue={String(preferences.maleFemaleRatio ?? "1:4")}
          placeholder="1:4"
        />
      </label>
      <label>
        Feed top-off unit
        <select name="feedTopOffUnit" defaultValue={String(preferences.feedTopOffUnit ?? "cup")}>
          <option value="cup">Cups</option>
          <option value="lb">Pounds</option>
          <option value="oz">Ounces</option>
        </select>
      </label>
      <label>
        Default cup weight, oz
        <input
          name="defaultCupWeightOz"
          type="number"
          min="0.1"
          step="0.1"
          defaultValue={String(preferences.defaultCupWeightOz ?? 8)}
        />
      </label>
      {includeIncubation ? (
        <>
          <label>
            Incubation days
            <input
              name="incubationDays"
              type="number"
              min="1"
              defaultValue={String(preferences.incubationDays ?? 17)}
            />
          </label>
          <label>
            Expected hatch day
            <input name="hatchDay" type="number" min="1" defaultValue={String(preferences.hatchDay ?? 17)} />
          </label>
          <label>
            Candle day
            <input name="candleDay" type="number" min="1" defaultValue={String(preferences.candleDay ?? 7)} />
          </label>
          <label>
            Lockdown day
            <input
              name="lockdownDay"
              type="number"
              min="1"
              defaultValue={String(preferences.lockdownDay ?? 14)}
            />
          </label>
        </>
      ) : null}
    </>
  );
}

function SetupProgress({ step }: { step: SetupStep }) {
  const steps: Array<[SetupStep, string]> = [
    ["homestead", "Covey"],
    ["coops", "Coops"],
    ["birds", "Birds"],
    ["finish", "Finish"]
  ];
  const currentIndex = steps.findIndex(([id]) => id === step);

  return (
    <div className="setup-progress" aria-label="Setup progress">
      {steps.map(([id, label], index) => (
        <span className={index <= currentIndex ? "active" : ""} key={id}>
          {label}
        </span>
      ))}
    </div>
  );
}

function setupTitle(step: SetupStep) {
  return {
    homestead: "Name and configure your covey.",
    coops: "Add your housing.",
    birds: "Add starter birds.",
    finish: "Review and enter the app."
  }[step];
}

function setupDescription(step: SetupStep) {
  return {
    homestead:
      "Your owner account is created. Now set the flock-level defaults that everything else will use.",
    coops:
      "Coops come before birds because feed, egg logs, breeding groups, and costs are usually tracked by housing.",
    birds:
      "Starter bird records are optional, but adding them now lets later screens calculate status, feed share, and weight history.",
    finish: "The setup pages are complete. From here on, these sections live in the dashboard."
  }[step];
}

function Dashboard({
  auditEvents,
  busy,
  birds,
  breedingLines,
  coops,
  eggLogs,
  feedInventoryEvents,
  feedLogs,
  feedTypes,
  sales,
  healthEvents,
  photoAttachments,
  hatchBatches,
  homestead,
  incubations,
  managedUsers,
  matingPeriods,
  weightLogs,
  themeMode,
  user,
  onCreateCoop,
  onCreateBird,
  onCreateBreedingLine,
  onCreateEggLog,
  onCreateFeedInventoryEvent,
  onCreateFeedLog,
  onCreateFeedType,
  onCreateSale,
  onCreateHealthEvent,
  onCreateHatchBatch,
  onCreateIncubation,
  onCreateMatingPeriod,
  onCreateManagedUser,
  onCreateWeightLog,
  onDeleteBird,
  onDeleteBreedingLine,
  onDeleteCoop,
  onBulkDeleteBirds,
  onBulkDeleteCoops,
  onBulkDeleteEggLogs,
  onBulkDeleteFeedInventoryEvents,
  onBulkDeleteFeedLogs,
  onBulkDeleteFeedTypes,
  onBulkDeleteIncubations,
  onBulkDeleteBreedingLines,
  onBulkDeleteMatingPeriods,
  onBulkUpdateBirds,
  onBulkUpdateCoops,
  onBulkUpdateEggLogs,
  onBulkUpdateFeedInventoryEvents,
  onBulkUpdateFeedLogs,
  onBulkUpdateFeedTypes,
  onBulkUpdateIncubations,
  onBulkUpdateBreedingLines,
  onBulkUpdateMatingPeriods,
  onDeleteEggLog,
  onDeleteFeedInventoryEvent,
  onDeleteFeedLog,
  onDeleteFeedType,
  onDeleteSale,
  onDeleteHealthEvent,
  onDeletePhoto,
  onDeleteIncubation,
  onDeleteMatingPeriod,
  onDisableManagedUser,
  onDeleteWeightLog,
  onLogout,
  onSettings,
  onStartMfaSetup,
  onThemeModeChange,
  onUpdateCoop,
  onUpdateBird,
  onUpdateBreedingLine,
  onUpdateEggLog,
  onUpdateFeedInventoryEvent,
  onUpdateFeedLog,
  onUpdateFeedType,
  onUpdateSale,
  onUpdateHealthEvent,
  onCreatePhoto,
  onUpdateIncubation,
  onUpdateMatingPeriod,
  onUpdateManagedUser,
  onEnableMfa,
  onDisableMfa,
  onExportData,
  onImportBundle,
  onImportData,
  onLoadAuditEvents
}: {
  auditEvents: AuditEvent[];
  busy: boolean;
  birds: Bird[];
  breedingLines: BreedingLine[];
  coops: Coop[];
  eggLogs: EggLog[];
  feedInventoryEvents: FeedInventoryEvent[];
  feedLogs: FeedLog[];
  feedTypes: FeedType[];
  sales: SaleRecord[];
  healthEvents: HealthEvent[];
  photoAttachments: PhotoAttachment[];
  hatchBatches: HatchBatch[];
  homestead: Homestead;
  incubations: Incubation[];
  managedUsers: ManagedUser[];
  matingPeriods: MatingPeriod[];
  weightLogs: WeightLog[];
  themeMode: ThemeMode;
  user: User;
  onCreateCoop: (event: FormEvent<HTMLFormElement>) => void;
  onCreateBird: (event: FormEvent<HTMLFormElement>) => void;
  onCreateBreedingLine: (event: FormEvent<HTMLFormElement>) => void;
  onCreateEggLog: (event: FormEvent<HTMLFormElement>) => void;
  onCreateFeedInventoryEvent: (event: FormEvent<HTMLFormElement>) => void;
  onCreateFeedLog: (event: FormEvent<HTMLFormElement>) => void;
  onCreateFeedType: (event: FormEvent<HTMLFormElement>) => void;
  onCreateSale: (event: FormEvent<HTMLFormElement>) => void;
  onCreateHealthEvent: (event: FormEvent<HTMLFormElement>) => void;
  onCreateHatchBatch: (incubation: Incubation, createChicks: boolean) => void;
  onCreateIncubation: (event: FormEvent<HTMLFormElement>) => void;
  onCreateMatingPeriod: (event: FormEvent<HTMLFormElement>) => void;
  onCreateManagedUser: (event: FormEvent<HTMLFormElement>) => void;
  onCreateWeightLog: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteBird: (id: string) => void;
  onDeleteBreedingLine: (id: string) => void;
  onDeleteCoop: (id: string) => void;
  onBulkDeleteBirds: (ids: string[]) => Promise<void>;
  onBulkDeleteCoops: (ids: string[]) => Promise<void>;
  onBulkDeleteEggLogs: (ids: string[]) => Promise<void>;
  onBulkDeleteFeedInventoryEvents: (ids: string[]) => Promise<void>;
  onBulkDeleteFeedLogs: (ids: string[]) => Promise<void>;
  onBulkDeleteFeedTypes: (ids: string[]) => Promise<void>;
  onBulkDeleteIncubations: (ids: string[]) => Promise<void>;
  onBulkDeleteBreedingLines: (ids: string[]) => Promise<void>;
  onBulkDeleteMatingPeriods: (ids: string[]) => Promise<void>;
  onBulkUpdateBirds: (ids: string[], patch: Partial<Pick<Bird, "status">> & { coopId?: string | null }) => Promise<void>;
  onBulkUpdateCoops: (ids: string[], patch: Partial<Pick<Coop, "type" | "capacity">>) => Promise<void>;
  onBulkUpdateEggLogs: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateFeedInventoryEvents: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateFeedLogs: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateFeedTypes: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateIncubations: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateBreedingLines: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateMatingPeriods: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onDeleteEggLog: (id: string) => void;
  onDeleteFeedInventoryEvent: (id: string) => void;
  onDeleteFeedLog: (id: string) => void;
  onDeleteFeedType: (id: string) => void;
  onDeleteSale: (id: string) => void;
  onDeleteHealthEvent: (id: string) => void;
  onDeletePhoto: (id: string) => void;
  onDeleteIncubation: (id: string) => void;
  onDeleteMatingPeriod: (id: string) => void;
  onDisableManagedUser: (id: string) => void;
  onDeleteWeightLog: (id: string) => void;
  onExportData: (format?: "json" | "bundle", includePhotos?: boolean) => void;
  onImportBundle: (dataUrl: string, options: RestoreOptions) => Promise<void>;
  onImportData: (data: unknown, options: RestoreOptions) => Promise<void>;
  onLoadAuditEvents: () => Promise<void>;
  onLogout: () => void;
  onSettings: (event: FormEvent<HTMLFormElement>) => void;
  onStartMfaSetup: () => Promise<MfaSetup | null>;
  onThemeModeChange: (mode: ThemeMode) => void;
  onUpdateCoop: (id: string, form: HTMLFormElement) => void;
  onUpdateBird: (id: string, form: HTMLFormElement) => void;
  onUpdateBreedingLine: (id: string, form: HTMLFormElement) => void;
  onUpdateEggLog: (id: string, form: HTMLFormElement) => void;
  onUpdateFeedInventoryEvent: (id: string, form: HTMLFormElement) => void;
  onUpdateFeedLog: (id: string, form: HTMLFormElement) => void;
  onUpdateFeedType: (id: string, form: HTMLFormElement) => void;
  onUpdateSale: (id: string, form: HTMLFormElement) => void;
  onUpdateHealthEvent: (id: string, form: HTMLFormElement) => void;
  onCreatePhoto: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateIncubation: (id: string, form: HTMLFormElement) => void;
  onUpdateMatingPeriod: (id: string, form: HTMLFormElement) => void;
  onUpdateManagedUser: (id: string, form: HTMLFormElement) => void;
  onEnableMfa: (event: FormEvent<HTMLFormElement>) => void;
  onDisableMfa: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [section, setSection] = useState<DashboardSection>("overview");
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);
  const [dismissedWorkItemIds, setDismissedWorkItemIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("coveyDismissedWorkItems") ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [customWorkItems, setCustomWorkItems] = useState<CustomWorkItem[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem("coveyCustomWorkItems") ?? "[]") as unknown[];
      return parsed.map(normalizeCustomWorkItem).filter((item): item is CustomWorkItem => Boolean(item));
    } catch {
      return [];
    }
  });
  const systemTodoItems = buildTodoItems({ birds, healthEvents, homestead, incubations, weightLogs }).map((item) => ({
    ...item,
    kind: "todo" as const
  }));
  const activeCustomWorkItems = customWorkItems.filter((item) => !item.completedAt);
  const customTodoItems = activeCustomWorkItems.map(customWorkToWorkItem);
  const todoItems = [...systemTodoItems, ...customTodoItems];
  const recommendationItems = buildRecommendationItems({ birds, coops, homestead, matingPeriods }).map((item) => ({
    ...item,
    kind: "recommendation" as const
  }));
  const dismissedWorkItemSet = new Set(dismissedWorkItemIds);
  const visibleTodoItems = todoItems.filter((item) => !dismissedWorkItemSet.has(`todos:${item.id}`));
  const visibleRecommendationItems = recommendationItems.filter(
    (item) => !dismissedWorkItemSet.has(`recommendations:${item.id}`)
  );
  const dismissedTodoCount = todoItems.length - visibleTodoItems.length;
  const dismissedRecommendationCount = recommendationItems.length - visibleRecommendationItems.length;
  const calendarItems = [...visibleTodoItems, ...visibleRecommendationItems].filter((item) => normalizeDateKey(item.dueDate));
  const navItems: Array<{ id: DashboardSection; label: string; icon: string; badge?: number }> = [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "chores", label: "Chores", icon: "✎" },
    { id: "flock", label: "Flock", icon: "♧" },
    { id: "coops", label: "Coops", icon: "▦" },
    { id: "cameras", label: "Cameras", icon: "▣" },
    { id: "eggs", label: "Egg production", icon: "◯" },
    { id: "feed", label: "Feed", icon: "⌁" },
    { id: "sales", label: "Sales", icon: "$" },
    { id: "health", label: "Health", icon: "✚" },
    { id: "incubation", label: "Incubation", icon: "◒" },
    { id: "breeding", label: "Breeding lines", icon: "⋔" },
    { id: "todos", label: "To do", icon: "✓", badge: visibleTodoItems.length },
    { id: "recommendations", label: "Recommendations", icon: "◇", badge: visibleRecommendationItems.length },
    { id: "calendar", label: "Calendar", icon: "□" },
    { id: "reports", label: "Reports", icon: "▤" },
    { id: "audit", label: "History", icon: "☷" },
    { id: "settings", label: "Settings", icon: "⚙" }
  ];

  useEffect(() => {
    localStorage.setItem("coveyDismissedWorkItems", JSON.stringify(dismissedWorkItemIds));
  }, [dismissedWorkItemIds]);

  useEffect(() => {
    localStorage.setItem("coveyCustomWorkItems", JSON.stringify(customWorkItems));
  }, [customWorkItems]);

  function createCustomWorkItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = fieldValue(form, "title");
    const dueDate = normalizeDateKey(fieldValue(form, "dueDate"));
    if (!title || !dueDate) return;
    const item: CustomWorkItem = {
      id: createLocalId("custom-task"),
      title,
      detail: fieldValue(form, "detail"),
      priority: fieldValue(form, "priority") as WorkItemPriority,
      dueDate,
      section: fieldValue(form, "section") as DashboardSection,
      completedAt: null,
      createdAt: new Date().toISOString()
    };
    setCustomWorkItems((current) => [item, ...current]);
    form.reset();
  }

  function completeCustomWorkItem(id: string) {
    setCustomWorkItems((current) =>
      current.map((item) => (item.id === id ? { ...item, completedAt: new Date().toISOString() } : item))
    );
  }

  function restoreCustomWorkItem(id: string) {
    setCustomWorkItems((current) =>
      current.map((item) => (item.id === id ? { ...item, completedAt: null } : item))
    );
  }

  function deleteCustomWorkItem(id: string) {
    setCustomWorkItems((current) => current.filter((item) => item.id !== id));
    setDismissedWorkItemIds((current) => current.filter((itemId) => itemId !== `todos:${id}`));
  }

  function dismissWorkItem(kind: "todos" | "recommendations", id: string) {
    const key = `${kind}:${id}`;
    setDismissedWorkItemIds((current) => (current.includes(key) ? current : [...current, key]));
  }

  function restoreWorkItems(kind: "todos" | "recommendations") {
    setDismissedWorkItemIds((current) => current.filter((id) => !id.startsWith(`${kind}:`)));
  }

  function openRecord(target: RecordTarget) {
    setRecordTarget(target);
    if (target.type === "bird") setSection("flock");
    if (target.type === "breedingLine" || target.type === "matingPeriod") setSection("breeding");
    if (target.type === "hatchBatch") setSection("incubation");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>Covey</strong>
            <span>Quail manager</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              className={`side-nav-item ${section === item.id ? "active" : ""}`}
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.badge ? <b className="nav-badge">{item.badge}</b> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="keeper">
            <span className="avatar">{initials(user.display_name)}</span>
            <span>
              <strong>{homestead.name}</strong>
              <small>{user.display_name}</small>
              <small>{user.role.toLowerCase()}</small>
            </span>
          </div>
          <button className="sidebar-signout" disabled={busy} type="button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <div>
            <p className="eyebrow">Flock manager</p>
            <h1>{sectionTitle(section)}</h1>
          </div>
          <div className="topbar-actions">
            <button
              className="theme-toggle"
              disabled={busy || user.role !== "OWNER"}
              type="button"
              title={user.role === "OWNER" ? `Theme: ${themeModeLabel(themeMode)}` : "Only owners can change the shared theme."}
              onClick={() => onThemeModeChange(nextThemeMode(themeMode))}
            >
              <span>{themeModeIcon(themeMode)}</span>
              {themeModeLabel(themeMode)}
            </button>
            <div className="today">Backend-backed records</div>
          </div>
        </header>

      {section === "overview" ? (
        <DashboardOverview
          birds={birds}
          coops={coops}
          eggLogs={eggLogs}
          feedTypes={feedTypes}
          feedLogs={feedLogs}
          homestead={homestead}
          onNavigate={setSection}
        />
      ) : null}

      {section === "chores" ? (
        <ChoreMode
          birds={birds}
          busy={busy}
          coops={coops}
          eggLogs={eggLogs}
          feedTypes={feedTypes}
          feedLogs={feedLogs}
          homestead={homestead}
          weightLogs={weightLogs}
          onCreateEggLog={onCreateEggLog}
          onCreateFeedLog={onCreateFeedLog}
          onCreateWeightLog={onCreateWeightLog}
        />
      ) : null}

      {section === "settings" ? (
        <SettingsManager
          busy={busy}
          coops={coops}
          homestead={homestead}
          managedUsers={managedUsers}
          user={user}
          onCreateManagedUser={onCreateManagedUser}
          onDisableManagedUser={onDisableManagedUser}
          onDisableMfa={onDisableMfa}
          onEnableMfa={onEnableMfa}
          onExportData={onExportData}
          onImportBundle={onImportBundle}
          onImportData={onImportData}
          onSettings={onSettings}
          onStartMfaSetup={onStartMfaSetup}
          onUpdateManagedUser={onUpdateManagedUser}
        />
      ) : null}

      {section === "coops" ? (
        <CoopManager
          birds={birds}
          busy={busy}
          coops={coops}
          feedLogs={feedLogs}
          onCreateCoop={onCreateCoop}
          onDeleteCoop={onDeleteCoop}
          onBulkDeleteCoops={onBulkDeleteCoops}
          onBulkUpdateCoops={onBulkUpdateCoops}
          onUpdateCoop={onUpdateCoop}
        />
      ) : null}

      {section === "cameras" ? (
        <CameraOverview coops={coops} onNavigate={setSection} />
      ) : null}

      {section === "flock" ? (
        <BirdManager
          birds={birds}
          busy={busy}
          coops={coops}
          eggLogs={eggLogs}
          feedLogs={feedLogs}
          hatchBatches={hatchBatches}
          homestead={homestead}
          matingPeriods={matingPeriods}
          photoAttachments={photoAttachments}
          recordTarget={recordTarget}
          weightLogs={weightLogs}
          onCreateBird={onCreateBird}
          onCreateWeightLog={onCreateWeightLog}
          onDeleteBird={onDeleteBird}
          onDeletePhoto={onDeletePhoto}
          onDeleteWeightLog={onDeleteWeightLog}
          onBulkDeleteBirds={onBulkDeleteBirds}
          onBulkUpdateBirds={onBulkUpdateBirds}
          onOpenRecord={openRecord}
          onCreatePhoto={onCreatePhoto}
          onRecordTargetHandled={() => setRecordTarget(null)}
          onUpdateBird={onUpdateBird}
        />
      ) : null}

      {section === "eggs" ? (
        <EggManager
          birds={birds}
          breedingLines={breedingLines}
          busy={busy}
          coops={coops}
          eggLogs={eggLogs}
          homestead={homestead}
          onCreateEggLog={onCreateEggLog}
          onBulkDeleteEggLogs={onBulkDeleteEggLogs}
          onBulkUpdateEggLogs={onBulkUpdateEggLogs}
          onDeleteEggLog={onDeleteEggLog}
          onUpdateEggLog={onUpdateEggLog}
        />
      ) : null}

      {section === "feed" ? (
        <FeedManager
          birds={birds}
          busy={busy}
          coops={coops}
          homestead={homestead}
          feedInventoryEvents={feedInventoryEvents}
          feedLogs={feedLogs}
          feedTypes={feedTypes}
          photoAttachments={photoAttachments}
          onCreateFeedInventoryEvent={onCreateFeedInventoryEvent}
          onCreateFeedLog={onCreateFeedLog}
          onCreateFeedType={onCreateFeedType}
          onBulkDeleteFeedInventoryEvents={onBulkDeleteFeedInventoryEvents}
          onBulkDeleteFeedLogs={onBulkDeleteFeedLogs}
          onBulkDeleteFeedTypes={onBulkDeleteFeedTypes}
          onBulkUpdateFeedInventoryEvents={onBulkUpdateFeedInventoryEvents}
          onBulkUpdateFeedLogs={onBulkUpdateFeedLogs}
          onBulkUpdateFeedTypes={onBulkUpdateFeedTypes}
          onDeleteFeedInventoryEvent={onDeleteFeedInventoryEvent}
          onDeleteFeedLog={onDeleteFeedLog}
          onDeleteFeedType={onDeleteFeedType}
          onDeletePhoto={onDeletePhoto}
          onCreatePhoto={onCreatePhoto}
          onUpdateFeedInventoryEvent={onUpdateFeedInventoryEvent}
          onUpdateFeedLog={onUpdateFeedLog}
          onUpdateFeedType={onUpdateFeedType}
        />
      ) : null}

      {section === "sales" ? (
        <SalesManager
          birds={birds}
          breedingLines={breedingLines}
          busy={busy}
          coops={coops}
          hatchBatches={hatchBatches}
          incubations={incubations}
          matingPeriods={matingPeriods}
          sales={sales}
          onCreateSale={onCreateSale}
          onDeleteSale={onDeleteSale}
          onUpdateSale={onUpdateSale}
        />
      ) : null}

      {section === "health" ? (
        <HealthManager
          birds={birds}
          busy={busy}
          coops={coops}
          healthEvents={healthEvents}
          photoAttachments={photoAttachments}
          onCreateHealthEvent={onCreateHealthEvent}
          onDeleteHealthEvent={onDeleteHealthEvent}
          onDeletePhoto={onDeletePhoto}
          onCreatePhoto={onCreatePhoto}
          onUpdateHealthEvent={onUpdateHealthEvent}
        />
      ) : null}

      {section === "incubation" ? (
        <IncubationManager
          busy={busy}
          hatchBatches={hatchBatches}
          homestead={homestead}
          incubations={incubations}
          matingPeriods={matingPeriods}
          recordTarget={recordTarget}
          onCreateHatchBatch={onCreateHatchBatch}
          onCreateIncubation={onCreateIncubation}
          onBulkDeleteIncubations={onBulkDeleteIncubations}
          onBulkUpdateIncubations={onBulkUpdateIncubations}
          onDeleteIncubation={onDeleteIncubation}
          onRecordTargetHandled={() => setRecordTarget(null)}
          onUpdateIncubation={onUpdateIncubation}
        />
      ) : null}

      {section === "breeding" ? (
        <BreedingManager
          birds={birds}
          breedingLines={breedingLines}
          busy={busy}
          coops={coops}
          eggLogs={eggLogs}
          hatchBatches={hatchBatches}
          homestead={homestead}
          incubations={incubations}
          matingPeriods={matingPeriods}
          recordTarget={recordTarget}
          onCreateBreedingLine={onCreateBreedingLine}
          onCreateMatingPeriod={onCreateMatingPeriod}
          onBulkDeleteBreedingLines={onBulkDeleteBreedingLines}
          onBulkDeleteMatingPeriods={onBulkDeleteMatingPeriods}
          onBulkUpdateBreedingLines={onBulkUpdateBreedingLines}
          onBulkUpdateMatingPeriods={onBulkUpdateMatingPeriods}
          onDeleteBreedingLine={onDeleteBreedingLine}
          onDeleteMatingPeriod={onDeleteMatingPeriod}
          onRecordTargetHandled={() => setRecordTarget(null)}
          onUpdateBreedingLine={onUpdateBreedingLine}
          onUpdateMatingPeriod={onUpdateMatingPeriod}
        />
      ) : null}

      {section === "todos" ? (
        <WorkList
          customItems={customWorkItems}
          dismissedCount={dismissedTodoCount}
          emptyDetail="No due reminders right now. Nice and quiet."
          eyebrow="To do"
          items={visibleTodoItems}
          onCompleteCustom={completeCustomWorkItem}
          onCreateCustom={createCustomWorkItem}
          onDeleteCustom={deleteCustomWorkItem}
          onDismiss={(id) => dismissWorkItem("todos", id)}
          onNavigate={setSection}
          onRestoreCustom={restoreCustomWorkItem}
          onRestoreDismissed={() => restoreWorkItems("todos")}
          title="Timed reminders"
        />
      ) : null}

      {section === "recommendations" ? (
        <WorkList
          dismissedCount={dismissedRecommendationCount}
          emptyDetail="No recommendations yet. More flock, breeding, and growth records will make this smarter."
          eyebrow="Recommendations"
          items={visibleRecommendationItems}
          onDismiss={(id) => dismissWorkItem("recommendations", id)}
          onNavigate={setSection}
          onRestoreDismissed={() => restoreWorkItems("recommendations")}
          title="Advisory review list"
        />
      ) : null}

      {section === "calendar" ? (
        <WorkCalendar
          customItems={customWorkItems}
          items={calendarItems}
          onCompleteCustom={completeCustomWorkItem}
          onCreateCustom={createCustomWorkItem}
          onDeleteCustom={deleteCustomWorkItem}
          onDismissRecommendation={(id) => dismissWorkItem("recommendations", id)}
          onDismissTodo={(id) => dismissWorkItem("todos", id)}
          onNavigate={setSection}
          onRestoreCustom={restoreCustomWorkItem}
        />
      ) : null}

      {section === "reports" ? (
        <ReportsManager
          birds={birds}
          breedingLines={breedingLines}
          coops={coops}
          eggLogs={eggLogs}
          feedTypes={feedTypes}
          feedLogs={feedLogs}
          hatchBatches={hatchBatches}
          healthEvents={healthEvents}
          homestead={homestead}
          incubations={incubations}
          matingPeriods={matingPeriods}
          sales={sales}
        />
      ) : null}

      {section === "audit" ? (
        <AuditManager
          auditEvents={auditEvents}
          managedUsers={managedUsers}
          onRefresh={onLoadAuditEvents}
        />
      ) : null}
      </main>
    </div>
  );
}

function DashboardOverview({
  birds,
  coops,
  eggLogs,
  feedTypes,
  feedLogs,
  homestead,
  onNavigate
}: {
  birds: Bird[];
  coops: Coop[];
  eggLogs: EggLog[];
  feedTypes: FeedType[];
  feedLogs: FeedLog[];
  homestead: Homestead;
  onNavigate: (section: DashboardSection) => void;
}) {
  const activeBirds = birds.filter((bird) => bird.status === "ACTIVE");
  const males = activeBirds.filter((bird) => bird.sex === "MALE").length;
  const females = activeBirds.filter((bird) => bird.sex === "FEMALE").length;
  const breedingCoops = coops.filter((coop) => coop.type === "BREEDING").length;
  const targetRatio = String(homestead.preferences.maleFemaleRatio ?? "1:4");
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyFeedCost = feedLogs
    .filter((log) => new Date(log.logged_at).getTime() >= weekStart)
    .reduce((total, log) => total + numberValue(log.cost), 0);
  const weeklyEggCount = eggLogs
    .filter((log) => dateKeyTime(log.logged_on) >= weekStart)
    .reduce((total, log) => total + numberValue(log.quantity), 0);
  const tableEggValue = preferenceNumber(homestead, "valueTableEgg", 0.35);
  const weeklyEggValue = eggLogs
    .filter((log) => dateKeyTime(log.logged_on) >= weekStart)
    .reduce((total, log) => total + eggLogValue(log, tableEggValue), 0);
  const latestFeedLog = feedLogs[0];
  const inventoryCups = feedTypes.reduce((total, feed) => total + numberValue(feed.inventory_cups), 0);
  const inventoryValue = feedTypes.reduce((total, feed) => total + feedInventoryValue(feed), 0);

  return (
    <>
      <section className="metric-grid" aria-label="Flock summary">
        <article className="metric-card">
          <p className="eyebrow">Active birds</p>
          <strong>{activeBirds.length}</strong>
          <span>{birds.length} total records</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Coops</p>
          <strong>{coops.length}</strong>
          <span>{breedingCoops} breeding</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Sex ratio</p>
          <strong>
            {males}:{females}
          </strong>
          <span>{targetRatio} target</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Weekly feed</p>
          <strong>{money(weeklyFeedCost)}</strong>
          <span>{latestFeedLog ? `latest: ${latestFeedLog.coop_name}` : "no feed logs yet"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Feed on hand</p>
          <strong>{inventoryCups.toFixed(1)} cups</strong>
          <span>{money(inventoryValue)} estimated value</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Weekly eggs</p>
          <strong>{weeklyEggCount}</strong>
          <span>collection records</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Egg value</p>
          <strong>{money(weeklyEggValue)}</strong>
          <span>this week, estimated</span>
        </article>
      </section>

      <section className="panel action-panel">
        <div>
          <p className="eyebrow">At a glance</p>
          <h2>Your flock workspace is ready.</h2>
          <p className="muted">
            Use the sidebar to move between flock, feed, eggs, breeding, incubation, cameras, reminders,
            recommendations, and settings.
          </p>
        </div>
        <div className="action-grid">
          <button type="button" onClick={() => onNavigate("coops")}>
            Manage coops
          </button>
          <button type="button" onClick={() => onNavigate("flock")}>
            Manage birds
          </button>
          <button type="button" onClick={() => onNavigate("eggs")}>
            Log eggs
          </button>
          <button type="button" onClick={() => onNavigate("settings")}>
            Edit settings
          </button>
          <button type="button" onClick={() => onNavigate("feed")}>
            Track feed
          </button>
        </div>
      </section>
    </>
  );
}

function ChoreMode({
  birds,
  busy,
  coops,
  eggLogs,
  feedTypes,
  feedLogs,
  homestead,
  weightLogs,
  onCreateEggLog,
  onCreateFeedLog,
  onCreateWeightLog
}: {
  birds: Bird[];
  busy: boolean;
  coops: Coop[];
  eggLogs: EggLog[];
  feedTypes: FeedType[];
  feedLogs: FeedLog[];
  homestead: Homestead;
  weightLogs: WeightLog[];
  onCreateEggLog: (event: FormEvent<HTMLFormElement>) => void;
  onCreateFeedLog: (event: FormEvent<HTMLFormElement>) => void;
  onCreateWeightLog: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const today = dateKeyDaysAgo(0);
  const activeBirds = birds.filter((bird) => bird.status === "ACTIVE");
  const birdsWithBands = activeBirds.filter((bird) => bird.band || bird.name);
  const todaysEggLogs = eggLogs.filter((log) => normalizeDateKey(log.logged_on) === today);
  const todaysEggs = todaysEggLogs.reduce((sum, log) => sum + numberValue(log.quantity), 0);
  const todaysFeedLogs = feedLogs.filter((log) => log.logged_at.slice(0, 10) === today);
  const todaysWeights = weightLogs.filter((log) => normalizeDateKey(log.weighed_on) === today);
  const breedingAndLayerCoops = coops.filter((coop) => coop.type === "BREEDING" || coop.type === "GROW_OUT");
  const eggLoggedCoopIds = new Set(todaysEggLogs.map((log) => log.coop_id).filter(Boolean));
  const feedLoggedCoopIds = new Set(todaysFeedLogs.map((log) => log.coop_id));
  const weightLoggedBirdIds = new Set(todaysWeights.map((log) => log.bird_id));
  const coopsNeedingEggs = breedingAndLayerCoops.filter((coop) => !eggLoggedCoopIds.has(coop.id));
  const coopsNeedingFeed = coops.filter((coop) => !feedLoggedCoopIds.has(coop.id));
  const weighWeeks = parseWeighWeeks(homestead);
  const dueWeightBirds = birdsWithBands
    .map((bird) => {
      const logs = weightLogs.filter((log) => log.bird_id === bird.id);
      for (const week of weighWeeks) {
        const targetDate = dateKeyAddDays(bird.hatch_date ?? "", week * 7);
        const daysFromTarget = dateDiffDays(targetDate, today);
        if (daysFromTarget == null || daysFromTarget < 0 || daysFromTarget > 5) continue;
        const hasNearbyLog = logs.some((log) => {
          const daysFromLog = dateDiffDays(targetDate, log.weighed_on);
          return daysFromLog != null && Math.abs(daysFromLog) <= 3;
        });
        if (!hasNearbyLog) return { bird, week, targetDate, daysFromTarget };
      }
      return null;
    })
    .filter((item): item is { bird: Bird; week: number; targetDate: string; daysFromTarget: number } => Boolean(item))
    .sort((a, b) => a.daysFromTarget - b.daysFromTarget);
  const nextDueWeight = dueWeightBirds.find((item) => !weightLoggedBirdIds.has(item.bird.id)) ?? dueWeightBirds[0] ?? null;
  const weightSelectBirds = nextDueWeight
    ? birdsWithBands.filter((bird) => bird.id !== nextDueWeight.bird.id)
    : birdsWithBands;
  const preferredTopOffUnit = normalizeFeedTopOffUnit(
    homestead.preferences.feedTopOffUnit ?? homestead.preferences.feedTopoffUnit
  );
  const feedPresets = preferredTopOffUnit === "cup" ? ["0.5", "1", "2", "4"] : preferredTopOffUnit === "oz" ? ["4", "8", "16"] : ["0.25", "0.5", "1"];
  const eggPresets = [4, 8, 12, 16];

  return (
    <section className="panel chore-mode">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Chore mode</p>
          <h2>Quick daily logging</h2>
          <p className="muted">
            Phone-friendly forms for the jobs you do with one hand: collect eggs, top off feed, and capture quick weights.
          </p>
        </div>
      </div>

      <section className="metric-grid embedded chore-summary" aria-label="Today's chore summary">
        <article className="metric-card">
          <p className="eyebrow">Today eggs</p>
          <strong>{todaysEggs}</strong>
          <span>{coopsNeedingEggs.length ? `${coopsNeedingEggs.length} coops left` : `${todaysEggLogs.length} logs`}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Feed top-offs</p>
          <strong>{todaysFeedLogs.length}</strong>
          <span>{coopsNeedingFeed.length ? `${coopsNeedingFeed.length} coops not logged` : "all coops logged"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Weights</p>
          <strong>{todaysWeights.length}</strong>
          <span>{dueWeightBirds.length ? `${dueWeightBirds.length} due soon` : "birds weighed today"}</span>
        </article>
      </section>

      <section className="chore-plan" aria-label="Today's chore plan">
        <article>
          <span>Eggs left</span>
          <strong>{coopsNeedingEggs.length ? coopsNeedingEggs.slice(0, 3).map((coop) => coop.name).join(", ") : "All likely coops logged"}</strong>
        </article>
        <article>
          <span>Feed left</span>
          <strong>{coopsNeedingFeed.length ? coopsNeedingFeed.slice(0, 3).map((coop) => coop.name).join(", ") : "All coops topped off"}</strong>
        </article>
        <article>
          <span>Next weigh-in</span>
          <strong>
            {nextDueWeight
              ? `${birdLabel(nextDueWeight.bird)} · ${nextDueWeight.week} wk ${dateStatusLabel(nextDueWeight.targetDate)}`
              : "No checkpoint due"}
          </strong>
        </article>
      </section>

      <div className="chore-grid">
        <article className="subpanel chore-card">
          <div>
            <p className="eyebrow">Eggs</p>
            <h3>Log collection</h3>
            <p className="muted compact-copy">Use coop totals by default. Fertility is tracked later through incubation/candling.</p>
          </div>
          <form className="chore-form" onSubmit={onCreateEggLog}>
            <input name="loggedOn" type="hidden" value={today} />
            <label>
              Coop
              <CoopSelect coops={coops} />
            </label>
            <label>
              Eggs
              <input name="quantity" required type="number" min="0" step="1" inputMode="numeric" />
            </label>
            <div className="quick-preset-row" aria-label="Egg quantity presets">
              {eggPresets.map((amount) => (
                <button key={amount} className="secondary" type="button" onClick={(event) => setFormField(event.currentTarget.form!, "quantity", String(amount))}>
                  {amount}
                </button>
              ))}
            </div>
            <label>
              Notes
              <input name="notes" placeholder="Shell quality, small eggs, etc." />
            </label>
            <button disabled={busy || !coops.length} type="submit">
              {busy ? "Saving..." : "Save eggs"}
            </button>
          </form>
        </article>

        <article className="subpanel chore-card">
          <div>
            <p className="eyebrow">Feed</p>
            <h3>Log top-off</h3>
            <p className="muted compact-copy">Uses your preferred top-off unit from Settings.</p>
          </div>
          <form className="chore-form" onSubmit={onCreateFeedLog}>
            <label>
              Coop
              <RequiredCoopSelect coops={coops} />
            </label>
            <label>
              Feed
              <FeedTypeSelect feedTypes={feedTypes} />
            </label>
            <label>
              Amount
              <input name="amount" required type="number" min="0.1" step="0.1" inputMode="decimal" />
            </label>
            <div className="quick-preset-row" aria-label="Feed amount presets">
              {feedPresets.map((amount) => (
                <button key={amount} className="secondary" type="button" onClick={(event) => setFormField(event.currentTarget.form!, "amount", amount)}>
                  {amount} {preferredTopOffUnit}
                </button>
              ))}
            </div>
            <label>
              Unit
              <select name="unit" defaultValue={preferredTopOffUnit}>
                <option value="cup">Cups</option>
                <option value="lb">Pounds</option>
                <option value="oz">Ounces</option>
              </select>
            </label>
            <label>
              Notes
              <input name="notes" placeholder="Spills, feeder condition, etc." />
            </label>
            <button disabled={busy || !feedTypes.length || !coops.length} type="submit">
              {busy ? "Saving..." : "Save top-off"}
            </button>
          </form>
        </article>

        <article className="subpanel chore-card">
          <div>
            <p className="eyebrow">Weights</p>
            <h3>Quick weigh-in</h3>
            <p className="muted compact-copy">Pick a bird by band/name and log today&apos;s weight.</p>
          </div>
          <form className="chore-form" onSubmit={onCreateWeightLog}>
            <input name="weighedOn" type="hidden" value={today} />
            <label>
              Bird
              <select name="birdId" required>
                <option value="">Select bird</option>
                {nextDueWeight ? (
                  <option value={nextDueWeight.bird.id}>Due: {birdLabel(nextDueWeight.bird)}</option>
                ) : null}
                {weightSelectBirds.map((bird) => (
                  <option key={bird.id} value={bird.id}>
                    {birdLabel(bird)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Weight, oz
              <input name="weightOz" required type="number" min="0.1" step="0.1" inputMode="decimal" />
            </label>
            {dueWeightBirds.length ? (
              <div className="chore-due-list">
                {dueWeightBirds.slice(0, 4).map((item) => (
                  <button
                    key={item.bird.id}
                    className="secondary"
                    type="button"
                    onClick={(event) => setFormField(event.currentTarget.form!, "birdId", item.bird.id)}
                  >
                    {birdLabel(item.bird)} · {item.week} wk
                  </button>
                ))}
              </div>
            ) : null}
            <label>
              Notes
              <input name="notes" placeholder="Growth check, condition, etc." />
            </label>
            <button disabled={busy || !birdsWithBands.length} type="submit">
              {busy ? "Saving..." : "Save weight"}
            </button>
          </form>
        </article>
      </div>
    </section>
  );
}

function EggManager({
  birds,
  breedingLines,
  busy,
  coops,
  eggLogs,
  homestead,
  onCreateEggLog,
  onBulkDeleteEggLogs,
  onBulkUpdateEggLogs,
  onDeleteEggLog,
  onUpdateEggLog
}: {
  birds: Bird[];
  breedingLines: BreedingLine[];
  busy: boolean;
  coops: Coop[];
  eggLogs: EggLog[];
  homestead: Homestead;
  onCreateEggLog: (event: FormEvent<HTMLFormElement>) => void;
  onBulkDeleteEggLogs: (ids: string[]) => Promise<void>;
  onBulkUpdateEggLogs: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onDeleteEggLog: (id: string) => void;
  onUpdateEggLog: (id: string, form: HTMLFormElement) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEggLogIds, setSelectedEggLogIds] = useState<string[]>([]);
  const [bulkEggEditing, setBulkEggEditing] = useState(false);
  const [bulkEggDate, setBulkEggDate] = useState("");
  const [bulkEggCoopId, setBulkEggCoopId] = useState("NO_CHANGE");
  const [bulkEggBirdId, setBulkEggBirdId] = useState("NO_CHANGE");
  const [bulkEggNotes, setBulkEggNotes] = useState("");
  const [sort, setSort] = useState<{ key: EggSortKey; dir: SortDirection }>({ key: "date", dir: "desc" });
  const [filters, setFilters] = useState({
    from: dateKeyDaysAgo(30),
    to: dateKeyDaysAgo(0),
    coopId: "",
    birdId: "",
    breedingLineId: ""
  });
  const defaultEggFilters = {
    from: dateKeyDaysAgo(30),
    to: dateKeyDaysAgo(0),
    coopId: "",
    birdId: "",
    breedingLineId: ""
  };
  const today = dateKeyDaysAgo(0);
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const filteredEggLogs = eggLogs.filter((log) => {
    const loggedOn = normalizeDateKey(log.logged_on);
    if (filters.from && loggedOn < filters.from) return false;
    if (filters.to && loggedOn > filters.to) return false;
    if (filters.coopId && log.coop_id !== filters.coopId) return false;
    if (filters.birdId && log.bird_id !== filters.birdId) return false;
    if (filters.breedingLineId && log.breeding_line_id !== filters.breedingLineId) return false;
    return true;
  });
  const weeklyEggCount = filteredEggLogs
    .filter((log) => dateKeyTime(log.logged_on) >= weekStart)
    .reduce((sum, log) => sum + numberValue(log.quantity), 0);
  const totalEggCount = filteredEggLogs.reduce((sum, log) => sum + numberValue(log.quantity), 0);
  const averageDailyEggs = filteredEggLogs.length
    ? totalEggCount / new Set(filteredEggLogs.map((log) => normalizeDateKey(log.logged_on))).size
    : 0;
  const tableEggValue = preferenceNumber(homestead, "valueTableEgg", 0.35);
  const totalEggValue = filteredEggLogs.reduce((sum, log) => sum + eggLogValue(log, tableEggValue), 0);
  const trendDays = dateRange(filters.from || dateKeyDaysAgo(13), filters.to || dateKeyDaysAgo(0)).slice(-31);
  const trendData = trendDays.map((date) => ({
    date,
    eggs: filteredEggLogs
      .filter((log) => normalizeDateKey(log.logged_on) === date)
      .reduce((sum, log) => sum + numberValue(log.quantity), 0)
  }));
  const maxTrendEggs = Math.max(1, ...trendData.map((day) => day.eggs));
  const sourceSummaries = Object.values(
    filteredEggLogs.reduce<Record<string, { source: string; eggs: number; value: number }>>(
      (summary, log) => {
        const source = eggSourceLabel(log);
        const key = `${log.bird_id ? "bird" : log.coop_id ? "coop" : "flock"}:${log.bird_id ?? log.coop_id ?? "all"}`;
        const current = summary[key] ?? { source, eggs: 0, value: 0 };
        current.eggs += numberValue(log.quantity);
        current.value += eggLogValue(log, tableEggValue);
        summary[key] = current;
        return summary;
      },
      {}
    )
  )
    .sort((a, b) => b.eggs - a.eggs)
    .slice(0, 6);
  const lineSummaries = Object.values(
    filteredEggLogs.reduce<Record<string, { line: string; eggs: number; value: number }>>(
      (summary, log) => {
        const key = log.breeding_line_id ?? "unknown";
        const line = log.breeding_line_name ?? "No line inferred";
        const current = summary[key] ?? { line, eggs: 0, value: 0 };
        current.eggs += numberValue(log.quantity);
        current.value += eggLogValue(log, tableEggValue);
        summary[key] = current;
        return summary;
      },
      {}
    )
  )
    .sort((a, b) => b.eggs - a.eggs)
    .slice(0, 6);
  const gridTemplateColumns = "44px 120px minmax(180px, 1.2fr) minmax(150px, 0.9fr) 100px minmax(160px, 1fr) 150px";
  const sortedEggLogs = [...filteredEggLogs].sort((a, b) => {
    const value = (log: EggLog) => {
      if (sort.key === "date") return normalizeDateKey(log.logged_on);
      if (sort.key === "source") return eggSourceLabel(log);
      return numberValue(log.quantity);
    };
    return compareValues(value(a), value(b)) * (sort.dir === "asc" ? 1 : -1);
  });
  const visibleEggLogIds = sortedEggLogs.map((log) => log.id);
  const visibleEggLogIdSet = new Set(visibleEggLogIds);
  const allVisibleEggLogsSelected =
    visibleEggLogIds.length > 0 && visibleEggLogIds.every((id) => selectedEggLogIds.includes(id));

  function toggleEggLogSelection(id: string) {
    setSelectedEggLogIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
    setBulkEggEditing(false);
  }

  function toggleVisibleEggLogs(checked: boolean) {
    setSelectedEggLogIds((current) => {
      if (!checked) return current.filter((id) => !visibleEggLogIdSet.has(id));
      return Array.from(new Set([...current, ...visibleEggLogIds]));
    });
    setBulkEggEditing(false);
  }

  async function applyBulkEggEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (bulkEggDate) patch.loggedOn = bulkEggDate;
    if (bulkEggCoopId !== "NO_CHANGE") patch.coopId = bulkEggCoopId === "none" ? null : bulkEggCoopId;
    if (bulkEggBirdId !== "NO_CHANGE") patch.birdId = bulkEggBirdId === "none" ? null : bulkEggBirdId;
    if (bulkEggNotes.trim()) patch.notes = bulkEggNotes.trim();
    if (!Object.keys(patch).length) return;
    await onBulkUpdateEggLogs(selectedEggLogIds, patch);
    setSelectedEggLogIds([]);
    setBulkEggEditing(false);
    setBulkEggDate("");
    setBulkEggCoopId("NO_CHANGE");
    setBulkEggBirdId("NO_CHANGE");
    setBulkEggNotes("");
  }

  async function applyBulkEggDelete() {
    if (!selectedEggLogIds.length) return;
    if (!confirm(`Delete ${selectedEggLogIds.length} selected egg logs?`)) return;
    await onBulkDeleteEggLogs(selectedEggLogIds);
    setSelectedEggLogIds([]);
    setBulkEggEditing(false);
  }

  function toggleSort(key: EggSortKey) {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "asc" ? "desc" : "asc"
    }));
  }

  function sortLabel(key: EggSortKey, label: string) {
    return `${label}${sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}`;
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Eggs</p>
          <h2>Egg production</h2>
          <p className="muted">
            Log eggs by coop when birds are mixed, or by bird when you know the layer. Fertility is measured later
            through incubation/candling records.
          </p>
        </div>
      </div>

      <section className="view-controls-panel">
        <div className="view-controls-header">
          <div>
            <p className="eyebrow">View controls</p>
            <h3>Filter production metrics</h3>
            <p className="muted compact-copy">
              These filters update the summary cards, trend, producer lists, and log table below.
            </p>
          </div>
          <button className="secondary" type="button" onClick={() => setFilters(defaultEggFilters)}>
            Reset filters
          </button>
        </div>
        <div className="filter-grid">
          <label>
            From
            <input
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            />
          </label>
          <label>
            Coop
            <select
              value={filters.coopId}
              onChange={(event) => setFilters((current) => ({ ...current, coopId: event.target.value }))}
            >
              <option value="">All coops</option>
              {coops.map((coop) => (
                <option key={coop.id} value={coop.id}>
                  {coop.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Bird
            <select
              value={filters.birdId}
              onChange={(event) => setFilters((current) => ({ ...current, birdId: event.target.value }))}
            >
              <option value="">All birds</option>
              {birds.map((bird) => (
                <option key={bird.id} value={bird.id}>
                  {birdLabel(bird)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Breeding line
            <select
              value={filters.breedingLineId}
              onChange={(event) => setFilters((current) => ({ ...current, breedingLineId: event.target.value }))}
            >
              <option value="">All lines</option>
              {breedingLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="metric-grid embedded" aria-label="Egg production summary">
        <article className="metric-card">
          <p className="eyebrow">This week</p>
          <strong>{weeklyEggCount}</strong>
          <span>eggs logged</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Filtered eggs</p>
          <strong>{totalEggCount}</strong>
          <span>{filteredEggLogs.length} logs</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Daily average</p>
          <strong>{averageDailyEggs.toFixed(1)}</strong>
          <span>eggs per logged day</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Egg value</p>
          <strong>{money(totalEggValue)}</strong>
          <span>{money(tableEggValue)} per collected egg</span>
        </article>
      </section>

      <div className="egg-insights">
        <section className="subpanel">
          <p className="eyebrow">Trend</p>
          <h3>Filtered trend</h3>
          <div className="egg-chart" aria-label="Egg production trend">
            {trendData.map((day) => (
              <div className="egg-bar-column" key={day.date}>
                <span>{day.eggs}</span>
                <div className="egg-bar-track">
                  <div
                    className="egg-bar-fill"
                    style={{ height: day.eggs ? `${Math.max(6, (day.eggs / maxTrendEggs) * 100)}%` : "0%" }}
                  />
                </div>
                <small>{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="subpanel">
          <p className="eyebrow">Sources</p>
          <h3>Top producers</h3>
          {sourceSummaries.length ? (
            <div className="source-summary">
              {sourceSummaries.map((source) => (
                <article key={`${source.source}-${source.eggs}-${source.value}`}>
                  <div>
                    <strong>{source.source}</strong>
                    <span>{source.eggs} eggs collected</span>
                  </div>
                  <b>{money(source.value)}</b>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Log eggs to compare coops, birds, or whole-flock production.</p>
          )}
        </section>

        <section className="subpanel">
          <p className="eyebrow">Lines</p>
          <h3>Breeding line context</h3>
          {lineSummaries.length ? (
            <div className="source-summary">
              {lineSummaries.map((line) => (
                <article key={`${line.line}-${line.eggs}-${line.value}`}>
                  <div>
                    <strong>{line.line}</strong>
                    <span>{line.eggs} eggs collected</span>
                  </div>
                  <b>{money(line.value)}</b>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Line context appears when eggs are logged by bird or during a known mating period.</p>
          )}
        </section>
      </div>

      <CreateRecordPanel
        buttonLabel="Log eggs"
        eyebrow="New log"
        title="Record eggs"
        description="Log by coop, by bird if known, or whole flock when collection is mixed."
      >
        <form className="egg-form" onSubmit={onCreateEggLog}>
          <label>
            Date
            <input name="loggedOn" required type="date" defaultValue={today} />
          </label>
          <label>
            Coop
            <CoopSelect coops={coops} />
          </label>
          <label>
            Bird, optional
            <BirdSelect birds={birds} />
          </label>
          <label>
            Eggs
            <input name="quantity" required type="number" min="0" step="1" />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" placeholder="Shell quality, collection time, unusual eggs, etc." />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Saving..." : "Log eggs"}
          </button>
        </form>
      </CreateRecordPanel>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Logs</p>
            <h3>Egg history</h3>
            <p className="muted compact-copy">
              Showing {filteredEggLogs.length} of {eggLogs.length} logs. Line filters use bird lineage when known,
              otherwise the coop's mating period on the log date.
            </p>
          </div>
        </div>
        <div className="table-card">
          <div className="table-control-panel">
            <div className="bulk-actions table-bulk-actions" aria-label="Bulk egg log actions">
              <span>
                {selectedEggLogIds.length > 1
                  ? `${selectedEggLogIds.length} selected`
                  : selectedEggLogIds.length === 1
                    ? "Select one more for bulk actions"
                    : "Select rows for bulk actions"}
              </span>
              {selectedEggLogIds.length > 1 ? (
                <>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkEggEditing((current) => !current)}>
                    Edit
                  </button>
                  <button className="danger" disabled={busy} type="button" onClick={applyBulkEggDelete}>
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            {bulkEggEditing && selectedEggLogIds.length > 1 ? (
              <form className="bulk-edit-form" onSubmit={applyBulkEggEdit}>
                <div>
                  <p className="eyebrow">Bulk edit</p>
                  <strong>Update {selectedEggLogIds.length} selected egg logs</strong>
                  <span>Fields left as no change will be skipped.</span>
                </div>
                <label>
                  Date
                  <input type="date" value={bulkEggDate} onChange={(event) => setBulkEggDate(event.target.value)} />
                </label>
                <label>
                  Coop
                  <select value={bulkEggCoopId} onChange={(event) => setBulkEggCoopId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    <option value="none">No coop</option>
                    {coops.map((coop) => (
                      <option key={coop.id} value={coop.id}>{coop.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Bird
                  <select value={bulkEggBirdId} onChange={(event) => setBulkEggBirdId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    <option value="none">No bird</option>
                    {birds.map((bird) => (
                      <option key={bird.id} value={bird.id}>{birdLabel(bird)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Notes
                  <input placeholder="No change" value={bulkEggNotes} onChange={(event) => setBulkEggNotes(event.target.value)} />
                </label>
                <div className="row-actions">
                  <button
                    disabled={
                      busy ||
                      (!bulkEggDate && bulkEggCoopId === "NO_CHANGE" && bulkEggBirdId === "NO_CHANGE" && !bulkEggNotes.trim())
                    }
                    type="submit"
                  >
                    Apply changes
                  </button>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkEggEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          {eggLogs.length ? (
            sortedEggLogs.length ? (
              <div className="egg-list">
                <div className="egg-row egg-table-head" style={{ gridTemplateColumns }}>
                  <label className="table-select-cell" aria-label="Select visible egg logs">
                    <input
                      checked={allVisibleEggLogsSelected}
                      type="checkbox"
                      onChange={(event) => toggleVisibleEggLogs(event.target.checked)}
                    />
                  </label>
                  <button className="sort-button" type="button" onClick={() => toggleSort("date")}>
                    {sortLabel("date", "Date")}
                  </button>
                  <button className="sort-button" type="button" onClick={() => toggleSort("source")}>
                    {sortLabel("source", "Source")}
                  </button>
                  <span className="sort-button">Line</span>
                  <button className="sort-button" type="button" onClick={() => toggleSort("quantity")}>
                    {sortLabel("quantity", "Eggs")}
                  </button>
                  <span className="sort-button">Notes</span>
                  <span />
                </div>
                {sortedEggLogs.map((log) =>
                  editingId === log.id ? (
                    <form
                      className="egg-row edit-egg-row"
                      key={log.id}
                      onSubmit={(event) => {
                        event.preventDefault();
                        onUpdateEggLog(log.id, event.currentTarget);
                        setEditingId(null);
                      }}
                    >
                      <label>
                        Date
                        <input name="loggedOn" required type="date" defaultValue={normalizeDateKey(log.logged_on)} />
                      </label>
                      <label>
                        Coop
                        <CoopSelect coops={coops} defaultValue={log.coop_id ?? ""} />
                      </label>
                      <label>
                        Bird
                        <BirdSelect birds={birds} defaultValue={log.bird_id ?? ""} />
                      </label>
                      <label>
                        Eggs
                        <input name="quantity" required type="number" min="0" step="1" defaultValue={log.quantity} />
                      </label>
                      <label>
                        Notes
                        <input name="notes" defaultValue={log.notes ?? ""} />
                      </label>
                      <div className="row-actions">
                        <button disabled={busy} type="submit">Save</button>
                        <button className="secondary" disabled={busy} type="button" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </form>
                  ) : (
                    <div className="egg-row" key={log.id} style={{ gridTemplateColumns }}>
                      <label className="table-select-cell" aria-label={`Select egg log ${log.logged_on}`} onClick={(event) => event.stopPropagation()}>
                        <input
                          checked={selectedEggLogIds.includes(log.id)}
                          type="checkbox"
                          onChange={() => toggleEggLogSelection(log.id)}
                        />
                      </label>
                      <strong>{displayDate(log.logged_on)}</strong>
                      <span>{eggSourceLabel(log)}</span>
                      <span>
                        {log.breeding_line_name ?? "No line"}
                        {log.mating_period_label ? <small>{log.mating_period_label}</small> : null}
                      </span>
                      <span>{numberValue(log.quantity)}</span>
                      <span>{log.notes || "No notes."}</span>
                      <div className="row-actions">
                        <button className="secondary" disabled={busy} type="button" onClick={() => setEditingId(log.id)}>Edit</button>
                        <button
                          className="danger"
                          disabled={busy}
                          type="button"
                          onClick={() => {
                            if (confirm("Delete this egg log?")) onDeleteEggLog(log.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="empty-state">
                <h3>No logs match these filters</h3>
                <p>Adjust the production view filters to see more egg history.</p>
              </div>
            )
          ) : (
            <div className="empty-state">
              <h3>No egg logs yet</h3>
              <p>Log eggs by coop or bird to start production metrics.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function IncubationManager({
  busy,
  hatchBatches,
  homestead,
  incubations,
  matingPeriods,
  recordTarget,
  onCreateHatchBatch,
  onCreateIncubation,
  onBulkDeleteIncubations,
  onBulkUpdateIncubations,
  onDeleteIncubation,
  onRecordTargetHandled,
  onUpdateIncubation
}: {
  busy: boolean;
  hatchBatches: HatchBatch[];
  homestead: Homestead;
  incubations: Incubation[];
  matingPeriods: MatingPeriod[];
  recordTarget?: RecordTarget | null;
  onCreateHatchBatch: (incubation: Incubation, createChicks: boolean) => void;
  onCreateIncubation: (event: FormEvent<HTMLFormElement>) => void;
  onBulkDeleteIncubations: (ids: string[]) => Promise<void>;
  onBulkUpdateIncubations: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onDeleteIncubation: (id: string) => void;
  onRecordTargetHandled?: () => void;
  onUpdateIncubation: (id: string, form: HTMLFormElement) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedIncubationIds, setSelectedIncubationIds] = useState<string[]>([]);
  const [bulkIncubationEditing, setBulkIncubationEditing] = useState(false);
  const [bulkIncubationMatingPeriodId, setBulkIncubationMatingPeriodId] = useState("NO_CHANGE");
  const [bulkIncubationCandleDate, setBulkIncubationCandleDate] = useState("");
  const [bulkIncubationLockdownDate, setBulkIncubationLockdownDate] = useState("");
  const [bulkIncubationHatchDate, setBulkIncubationHatchDate] = useState("");
  const [bulkIncubationNotes, setBulkIncubationNotes] = useState("");
  const today = dateKeyDaysAgo(0);
  const [newCycleSetDate, setNewCycleSetDate] = useState(today);
  const candleDay = Number(displayPreference(homestead, "candleDay", 7));
  const lockdownDay = Number(displayPreference(homestead, "lockdownDay", 15));
  const hatchDay = Number(displayPreference(homestead, "hatchDay", 17));
  const [newCycleDates, setNewCycleDates] = useState({
    candleDate: dateKeyAddDays(today, candleDay),
    lockdownDate: dateKeyAddDays(today, lockdownDay),
    expectedHatchDate: dateKeyAddDays(today, hatchDay)
  });
  const activeCycles = incubations.filter((cycle) => cycle.hatched_count == null);
  const totalEggsSet = incubations.reduce((sum, cycle) => sum + numberValue(cycle.eggs_set), 0);
  const fertileEggs = incubations.reduce((sum, cycle) => sum + numberValue(cycle.fertile_eggs), 0);
  const hatchedCount = incubations.reduce((sum, cycle) => sum + numberValue(cycle.hatched_count), 0);
  const autoCreateChicks = displayPreference(homestead, "autoCreateChickRecords", "yes") !== "no";
  const reminders = incubations
    .flatMap((cycle) => [
      { cycle, label: "Candle", date: cycle.candle_date },
      { cycle, label: "Lockdown", date: cycle.lockdown_date },
      { cycle, label: "Expected hatch", date: cycle.expected_hatch_date }
    ])
    .filter((reminder) => {
      const days = dateDiffDays(today, reminder.date ?? "");
      return days != null && days >= 0;
    })
    .sort((a, b) => (dateDiffDays(today, a.date ?? today) ?? 0) - (dateDiffDays(today, b.date ?? today) ?? 0))
    .slice(0, 4);
  const selectedCycle = incubations.find((cycle) => cycle.id === selectedCycleId) ?? null;
  const allIncubationsSelected =
    incubations.length > 0 && incubations.every((cycle) => selectedIncubationIds.includes(cycle.id));

  useEffect(() => {
    if (recordTarget?.type !== "hatchBatch") return;
    const batch = hatchBatches.find((candidate) => candidate.id === recordTarget.id);
    if (batch?.incubation_id) setSelectedCycleId(batch.incubation_id);
    onRecordTargetHandled?.();
  }, [hatchBatches, onRecordTargetHandled, recordTarget]);

  function toggleIncubationSelection(id: string) {
    setSelectedIncubationIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
    setBulkIncubationEditing(false);
  }

  function toggleAllIncubations(checked: boolean) {
    setSelectedIncubationIds(checked ? incubations.map((cycle) => cycle.id) : []);
    setBulkIncubationEditing(false);
  }

  async function applyBulkIncubationEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (bulkIncubationMatingPeriodId !== "NO_CHANGE") {
      patch.matingPeriodId = bulkIncubationMatingPeriodId === "none" ? null : bulkIncubationMatingPeriodId;
    }
    if (bulkIncubationCandleDate) patch.candleDate = bulkIncubationCandleDate;
    if (bulkIncubationLockdownDate) patch.lockdownDate = bulkIncubationLockdownDate;
    if (bulkIncubationHatchDate) patch.expectedHatchDate = bulkIncubationHatchDate;
    if (bulkIncubationNotes.trim()) patch.notes = bulkIncubationNotes.trim();
    if (!Object.keys(patch).length) return;
    await onBulkUpdateIncubations(selectedIncubationIds, patch);
    setSelectedIncubationIds([]);
    setBulkIncubationEditing(false);
    setBulkIncubationMatingPeriodId("NO_CHANGE");
    setBulkIncubationCandleDate("");
    setBulkIncubationLockdownDate("");
    setBulkIncubationHatchDate("");
    setBulkIncubationNotes("");
  }

  async function applyBulkIncubationDelete() {
    if (!selectedIncubationIds.length) return;
    if (!confirm(`Delete ${selectedIncubationIds.length} selected incubation cycles?`)) return;
    await onBulkDeleteIncubations(selectedIncubationIds);
    setSelectedIncubationIds([]);
    setBulkIncubationEditing(false);
  }

  if (selectedCycle) {
    return (
      <IncubationDetail
        autoCreateChicks={autoCreateChicks}
        busy={busy}
        cycle={selectedCycle}
        hatchBatches={hatchBatches}
        matingPeriods={matingPeriods}
        onBack={() => setSelectedCycleId(null)}
        onCreateHatchBatch={onCreateHatchBatch}
        onDeleteIncubation={onDeleteIncubation}
        onUpdateIncubation={onUpdateIncubation}
      />
    );
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Incubation</p>
          <h2>Cycles, reminders, and hatch results</h2>
          <p className="muted">
            Create a cycle from eggs set, then track candle, lockdown, fertility, and hatch rate as the
            cycle moves toward hatch day.
          </p>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Incubation summary">
        <article className="metric-card">
          <p className="eyebrow">Active cycles</p>
          <strong>{activeCycles.length}</strong>
          <span>{incubations.length} total</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Eggs set</p>
          <strong>{totalEggsSet}</strong>
          <span>across all cycles</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Fertility</p>
          <strong>{rateLabel(totalEggsSet ? (fertileEggs / totalEggsSet) * 100 : null)}</strong>
          <span>{fertileEggs} fertile tracked</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch rate</p>
          <strong>{rateLabel(totalEggsSet ? (hatchedCount / totalEggsSet) * 100 : null)}</strong>
          <span>{hatchedCount} hatched</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch batches</p>
          <strong>{hatchBatches.length}</strong>
          <span>{hatchBatches.reduce((sum, batch) => sum + numberValue(batch.chick_count), 0)} chicks recorded</span>
        </article>
      </section>

      <div className="incubation-layout">
        <CreateRecordPanel
          buttonLabel="Create incubation"
          eyebrow="New cycle"
          title="Create incubation"
          description="Create a cycle from eggs set; candle, lockdown, and hatch dates start from your incubation settings."
        >
          <form className="incubation-form" onSubmit={onCreateIncubation}>
            <label>
              Label
              <input name="label" required placeholder="June hatch 1" />
            </label>
            <label>
              Set date
              <input
                name="setDate"
                required
                type="date"
                value={newCycleSetDate}
                onChange={(event) => {
                  const setDate = event.target.value;
                  setNewCycleSetDate(setDate);
                  setNewCycleDates({
                    candleDate: dateKeyAddDays(setDate, candleDay),
                    lockdownDate: dateKeyAddDays(setDate, lockdownDay),
                    expectedHatchDate: dateKeyAddDays(setDate, hatchDay)
                  });
                }}
              />
            </label>
            <label>
              Mating period
              <MatingPeriodSelect matingPeriods={matingPeriods} />
            </label>
            <label>
              Eggs set
              <input name="eggsSet" required type="number" min="0" step="1" />
            </label>
            <label>
              Fertile eggs
              <input name="fertileEggs" type="number" min="0" step="1" />
            </label>
            <label>
              Hatched
              <input name="hatchedCount" type="number" min="0" step="1" />
            </label>
            <label>
              Candle date
              <input
                name="candleDate"
                type="date"
                value={newCycleDates.candleDate}
                onChange={(event) => setNewCycleDates((current) => ({ ...current, candleDate: event.target.value }))}
              />
            </label>
            <label>
              Lockdown date
              <input
                name="lockdownDate"
                type="date"
                value={newCycleDates.lockdownDate}
                onChange={(event) => setNewCycleDates((current) => ({ ...current, lockdownDate: event.target.value }))}
              />
            </label>
            <label>
              Expected hatch
              <input
                name="expectedHatchDate"
                type="date"
                value={newCycleDates.expectedHatchDate}
                onChange={(event) => setNewCycleDates((current) => ({ ...current, expectedHatchDate: event.target.value }))}
              />
            </label>
            <label>
              Days 1-13 temp, F
              <input name="incubationTempF" type="number" step="0.1" defaultValue={displayPreference(homestead, "incubationTempF", 100)} />
            </label>
            <label>
              Days 1-13 humidity %
              <input name="incubationHumidity" type="number" min="0" max="100" defaultValue={displayPreference(homestead, "incubationHumidity", 55)} />
            </label>
            <label>
              Lockdown temp, F
              <input name="lockdownTempF" type="number" step="0.1" defaultValue={displayPreference(homestead, "lockdownTempF", 100)} />
            </label>
            <label>
              Lockdown humidity %
              <input name="lockdownHumidity" type="number" min="0" max="100" defaultValue={displayPreference(homestead, "lockdownHumidity", 65)} />
            </label>
            <label className="wide-field">
              Notes
              <input name="notes" placeholder="Incubator, source eggs, turning notes, etc." />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Saving..." : "Create incubation"}
            </button>
          </form>
        </CreateRecordPanel>

        <section className="subpanel">
          <p className="eyebrow">Reminders</p>
          <h3>Next actions</h3>
          {reminders.length ? (
            <div className="reminder-list">
              {reminders.map((reminder) => (
                <article key={`${reminder.cycle.id}-${reminder.label}`}>
                  <strong>{reminder.label}</strong>
                  <span>{reminder.cycle.label}</span>
                  <b>{dateStatusLabel(reminder.date)}</b>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No upcoming incubation reminders yet.</p>
          )}
        </section>
      </div>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Cycles</p>
            <h3>Incubation timeline</h3>
            <p className="muted compact-copy">Track each cycle from set date through candle, lockdown, and hatch.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="table-control-panel">
            <div className="bulk-actions table-bulk-actions" aria-label="Bulk incubation actions">
              <label className="table-select-cell select-all-card" aria-label="Select all incubation cycles">
                <input checked={allIncubationsSelected} type="checkbox" onChange={(event) => toggleAllIncubations(event.target.checked)} />
              </label>
              <span>
                {selectedIncubationIds.length > 1
                  ? `${selectedIncubationIds.length} selected`
                  : selectedIncubationIds.length === 1
                    ? "Select one more for bulk actions"
                    : "Select cycles for bulk actions"}
              </span>
              {selectedIncubationIds.length > 1 ? (
                <>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkIncubationEditing((current) => !current)}>
                    Edit
                  </button>
                  <button className="danger" disabled={busy} type="button" onClick={applyBulkIncubationDelete}>
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            {bulkIncubationEditing && selectedIncubationIds.length > 1 ? (
              <form className="bulk-edit-form" onSubmit={applyBulkIncubationEdit}>
                <div>
                  <p className="eyebrow">Bulk edit</p>
                  <strong>Update {selectedIncubationIds.length} selected cycles</strong>
                  <span>Fields left as no change will be skipped.</span>
                </div>
                <label>
                  Mating period
                  <select value={bulkIncubationMatingPeriodId} onChange={(event) => setBulkIncubationMatingPeriodId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    <option value="none">No mating period</option>
                    {matingPeriods.map((period) => (
                      <option key={period.id} value={period.id}>{period.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Candle date
                  <input type="date" value={bulkIncubationCandleDate} onChange={(event) => setBulkIncubationCandleDate(event.target.value)} />
                </label>
                <label>
                  Lockdown date
                  <input type="date" value={bulkIncubationLockdownDate} onChange={(event) => setBulkIncubationLockdownDate(event.target.value)} />
                </label>
                <label>
                  Expected hatch
                  <input type="date" value={bulkIncubationHatchDate} onChange={(event) => setBulkIncubationHatchDate(event.target.value)} />
                </label>
                <label>
                  Notes
                  <input placeholder="No change" value={bulkIncubationNotes} onChange={(event) => setBulkIncubationNotes(event.target.value)} />
                </label>
                <div className="row-actions">
                  <button
                    disabled={
                      busy ||
                      (bulkIncubationMatingPeriodId === "NO_CHANGE" &&
                        !bulkIncubationCandleDate &&
                        !bulkIncubationLockdownDate &&
                        !bulkIncubationHatchDate &&
                        !bulkIncubationNotes.trim())
                    }
                    type="submit"
                  >
                    Apply changes
                  </button>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkIncubationEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          <div className="cycle-list">
          {incubations.length ? (
            incubations.map((cycle) =>
              editingId === cycle.id ? (
                <form
                  className="cycle-card edit-cycle-card"
                  key={cycle.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    onUpdateIncubation(cycle.id, event.currentTarget);
                    setEditingId(null);
                  }}
                >
                  <label>
                    Label
                    <input name="label" required defaultValue={cycle.label} />
                  </label>
                  <label>
                    Set date
                    <input name="setDate" required type="date" defaultValue={normalizeDateKey(cycle.set_date)} />
                  </label>
                  <label>
                    Mating period
                    <MatingPeriodSelect matingPeriods={matingPeriods} defaultValue={cycle.mating_period_id ?? ""} />
                  </label>
                  <label>
                    Eggs set
                    <input name="eggsSet" required type="number" min="0" step="1" defaultValue={cycle.eggs_set} />
                  </label>
                  <label>
                    Fertile eggs
                    <input name="fertileEggs" type="number" min="0" step="1" defaultValue={cycle.fertile_eggs ?? ""} />
                  </label>
                  <label>
                    Hatched
                    <input name="hatchedCount" type="number" min="0" step="1" defaultValue={cycle.hatched_count ?? ""} />
                  </label>
                  <label>
                    Candle date
                    <input name="candleDate" type="date" defaultValue={normalizeDateKey(cycle.candle_date)} />
                  </label>
                  <label>
                    Lockdown date
                    <input name="lockdownDate" type="date" defaultValue={normalizeDateKey(cycle.lockdown_date)} />
                  </label>
                  <label>
                    Expected hatch
                    <input name="expectedHatchDate" type="date" defaultValue={normalizeDateKey(cycle.expected_hatch_date)} />
                  </label>
                  <label>
                    Days 1-13 temp, F
                    <input name="incubationTempF" type="number" step="0.1" defaultValue={parameterValue(cycle.parameters, "incubationTempF")} />
                  </label>
                  <label>
                    Days 1-13 humidity %
                    <input name="incubationHumidity" type="number" min="0" max="100" defaultValue={parameterValue(cycle.parameters, "incubationHumidity")} />
                  </label>
                  <label>
                    Lockdown temp, F
                    <input name="lockdownTempF" type="number" step="0.1" defaultValue={parameterValue(cycle.parameters, "lockdownTempF")} />
                  </label>
                  <label>
                    Lockdown humidity %
                    <input name="lockdownHumidity" type="number" min="0" max="100" defaultValue={parameterValue(cycle.parameters, "lockdownHumidity")} />
                  </label>
                  <label className="wide-field">
                    Notes
                    <input name="notes" defaultValue={cycle.notes ?? ""} />
                  </label>
                  <div className="row-actions">
                    <button disabled={busy} type="submit">Save</button>
                    <button className="secondary" disabled={busy} type="button" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <article
                  className="cycle-card clickable-row"
                  key={cycle.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCycleId(cycle.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedCycleId(cycle.id);
                  }}
                >
                  <label className="table-select-cell card-select" aria-label={`Select ${cycle.label}`} onClick={(event) => event.stopPropagation()}>
                    <input
                      checked={selectedIncubationIds.includes(cycle.id)}
                      type="checkbox"
                      onChange={() => toggleIncubationSelection(cycle.id)}
                    />
                  </label>
                  <div className="cycle-card-head">
	                    <div>
	                      <strong>{cycle.label}</strong>
	                      <p>
                          {cycle.eggs_set} eggs set · {dateStatusLabel(cycle.expected_hatch_date)} hatch
                          {cycle.mating_period_label ? ` · ${cycle.breeding_line_name}: ${cycle.mating_period_label}` : ""}
                        </p>
	                    </div>
                    <span className="row-open-hint">Open</span>
                  </div>
                  <div className="cycle-timeline">
                    <div className="cycle-timeline-fill" style={{ width: `${percentComplete(cycle.set_date, cycle.expected_hatch_date)}%` }} />
                  </div>
                  <div className="cycle-milestones">
                    <span>Set {displayDate(cycle.set_date)}</span>
                    <span>Candle {displayDate(cycle.candle_date)}</span>
                    <span>Lockdown {displayDate(cycle.lockdown_date)}</span>
                    <span>Hatch {displayDate(cycle.expected_hatch_date)}</span>
                  </div>
                  <div className="pill-row">
	                    <span>{rateLabel(fertileRate(cycle.eggs_set, cycle.fertile_eggs))} fertile</span>
	                    <span>{rateLabel(fertileRate(cycle.eggs_set, cycle.hatched_count))} hatch</span>
                    <span>{cycle.hatch_batch_id ? "Hatch batch created" : "No hatch batch yet"}</span>
	                    <span>{cycle.notes || "No notes"}</span>
	                  </div>
                </article>
              )
            )
          ) : (
            <div className="empty-state">
              <h3>No incubation cycles yet</h3>
              <p>Create a cycle to see reminders, humidity changes, and hatch metrics.</p>
            </div>
          )}
        </div>
        </div>
      </section>

      <section className="subpanel">
        <p className="eyebrow">Batches</p>
        <h3>Hatch batches</h3>
        <div className="cycle-list">
          {hatchBatches.length ? (
            hatchBatches.map((batch) => (
              <article className="cycle-card" key={batch.id}>
                <div className="cycle-card-head">
                  <div>
                    <strong>{batch.label}</strong>
                    <p>
                      {displayDate(batch.hatch_date, "No hatch date")} · {batch.breeding_line_name || "No line"}
                      {batch.mating_period_label ? ` · ${batch.mating_period_label}` : ""}
                    </p>
                  </div>
                </div>
                <div className="pill-row">
                  <span>{batch.eggs_set} eggs set</span>
                  <span>{batch.fertile_eggs ?? "?"} fertile</span>
                  <span>{batch.hatched_count ?? "?"} hatched</span>
                  <span>{batch.chick_count} chick records</span>
                  <span>{batch.notes || batch.incubation_label || "No notes"}</span>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <h3>No hatch batches yet</h3>
              <p>Record a hatched count on an incubation and Covey will create the hatch batch automatically.</p>
            </div>
          )}
        </div>
        </div>
      </section>
	    </section>
  );
}

function IncubationDetail({
  autoCreateChicks,
  busy,
  cycle,
  hatchBatches,
  matingPeriods,
  onBack,
  onCreateHatchBatch,
  onDeleteIncubation,
  onUpdateIncubation
}: {
  autoCreateChicks: boolean;
  busy: boolean;
  cycle: Incubation;
  hatchBatches: HatchBatch[];
  matingPeriods: MatingPeriod[];
  onBack: () => void;
  onCreateHatchBatch: (incubation: Incubation, createChicks: boolean) => void;
  onDeleteIncubation: (id: string) => void;
  onUpdateIncubation: (id: string, form: HTMLFormElement) => void;
}) {
  const linkedBatch = hatchBatches.find((batch) => batch.incubation_id === cycle.id) ?? null;
  const fertility = fertileRate(cycle.eggs_set, cycle.fertile_eggs);
  const hatchRate = fertileRate(cycle.eggs_set, cycle.hatched_count);
  const hatchFromFertile = fertileRate(cycle.fertile_eggs, cycle.hatched_count);
  const daysToHatch = dateDiffDays(dateKeyDaysAgo(0), cycle.expected_hatch_date);

  return (
    <section className="panel detail-page">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Incubation detail</p>
          <h2>{cycle.label}</h2>
          <p className="muted">
            {cycle.eggs_set} eggs set · {cycle.breeding_line_name || "No line"}{cycle.mating_period_label ? ` · ${cycle.mating_period_label}` : ""}
          </p>
        </div>
        <div className="detail-header-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Back to incubation
          </button>
          {cycle.hatched_count != null && !cycle.hatch_batch_id ? (
            <button disabled={busy} type="button" onClick={() => onCreateHatchBatch(cycle, autoCreateChicks)}>
              Create hatch batch
            </button>
          ) : null}
          <button
            className="danger"
            disabled={busy}
            type="button"
            onClick={() => {
              if (confirm(`Delete ${cycle.label}?`)) {
                onDeleteIncubation(cycle.id);
                onBack();
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Incubation cycle summary">
        <article className="metric-card">
          <p className="eyebrow">Progress</p>
          <strong>{percentComplete(cycle.set_date, cycle.expected_hatch_date).toFixed(0)}%</strong>
          <span>
            {daysToHatch == null
              ? "expected hatch date unavailable"
              : daysToHatch >= 0
                ? `${daysToHatch} days to expected hatch`
                : "expected hatch passed"}
          </span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Fertility</p>
          <strong>{rateLabel(fertility)}</strong>
          <span>{cycle.fertile_eggs ?? "?"} of {cycle.eggs_set} eggs</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch rate</p>
          <strong>{rateLabel(hatchRate)}</strong>
          <span>{cycle.hatched_count ?? "?"} hatched</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch / fertile</p>
          <strong>{rateLabel(hatchFromFertile)}</strong>
          <span>incubation performance check</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Lockdown</p>
          <strong>{displayDate(cycle.lockdown_date)}</strong>
          <span>{cycle.lockdown_date ? dateStatusLabel(cycle.lockdown_date) : "no reminder"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch batch</p>
          <strong>{linkedBatch ? "Created" : "Not created"}</strong>
          <span>{linkedBatch?.label || "available after hatch count"}</span>
        </article>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Timeline</p>
            <h3>Cycle milestones</h3>
            <p className="muted compact-copy">Set, candle, lockdown, and hatch timing for this incubation.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="cycle-list">
            <article className="cycle-card">
              <div className="cycle-timeline">
                <div className="cycle-timeline-fill" style={{ width: `${percentComplete(cycle.set_date, cycle.expected_hatch_date)}%` }} />
              </div>
              <div className="cycle-milestones">
                <span>Set {displayDate(cycle.set_date)}</span>
                <span>Candle {displayDate(cycle.candle_date)}</span>
                <span>Lockdown {displayDate(cycle.lockdown_date)}</span>
                <span>Hatch {displayDate(cycle.expected_hatch_date)}</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Parameters</p>
            <h3>Incubation settings used</h3>
            <p className="muted compact-copy">Overrides saved with this cycle, separate from global defaults.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="source-summary record-card-list">
            {[
              ["Days 1 to lockdown temp", `${parameterValue(cycle.parameters, "incubationTempF") || "?"} F`],
              ["Days 1 to lockdown humidity", `${parameterValue(cycle.parameters, "incubationHumidity") || "?"}%`],
              ["Lockdown temp", `${parameterValue(cycle.parameters, "lockdownTempF") || "?"} F`],
              ["Lockdown humidity", `${parameterValue(cycle.parameters, "lockdownHumidity") || "?"}%`]
            ].map(([label, value]) => (
              <article key={label}>
                <div>
                  <strong>{label}</strong>
                  <span>{value}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CreateRecordPanel buttonLabel="Edit incubation" eyebrow="Record" title="Edit incubation">
        <form
          className="incubation-form"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateIncubation(cycle.id, event.currentTarget);
          }}
        >
          <label>
            Label
            <input name="label" required defaultValue={cycle.label} />
          </label>
          <label>
            Set date
            <input name="setDate" required type="date" defaultValue={normalizeDateKey(cycle.set_date)} />
          </label>
          <label>
            Mating period
            <MatingPeriodSelect matingPeriods={matingPeriods} defaultValue={cycle.mating_period_id ?? ""} />
          </label>
          <label>
            Eggs set
            <input name="eggsSet" required type="number" min="0" step="1" defaultValue={cycle.eggs_set} />
          </label>
          <label>
            Fertile eggs
            <input name="fertileEggs" type="number" min="0" step="1" defaultValue={cycle.fertile_eggs ?? ""} />
          </label>
          <label>
            Hatched
            <input name="hatchedCount" type="number" min="0" step="1" defaultValue={cycle.hatched_count ?? ""} />
          </label>
          <label>
            Candle date
            <input name="candleDate" type="date" defaultValue={normalizeDateKey(cycle.candle_date)} />
          </label>
          <label>
            Lockdown date
            <input name="lockdownDate" type="date" defaultValue={normalizeDateKey(cycle.lockdown_date)} />
          </label>
          <label>
            Expected hatch
            <input name="expectedHatchDate" type="date" defaultValue={normalizeDateKey(cycle.expected_hatch_date)} />
          </label>
          <label>
            Days 1-13 temp, F
            <input name="incubationTempF" type="number" step="0.1" defaultValue={parameterValue(cycle.parameters, "incubationTempF")} />
          </label>
          <label>
            Days 1-13 humidity %
            <input name="incubationHumidity" type="number" min="0" max="100" defaultValue={parameterValue(cycle.parameters, "incubationHumidity")} />
          </label>
          <label>
            Lockdown temp, F
            <input name="lockdownTempF" type="number" step="0.1" defaultValue={parameterValue(cycle.parameters, "lockdownTempF")} />
          </label>
          <label>
            Lockdown humidity %
            <input name="lockdownHumidity" type="number" min="0" max="100" defaultValue={parameterValue(cycle.parameters, "lockdownHumidity")} />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" defaultValue={cycle.notes ?? ""} />
          </label>
          <div className="row-actions">
            <button disabled={busy} type="submit">Save incubation</button>
          </div>
        </form>
      </CreateRecordPanel>
    </section>
  );
}

function BreedingManager({
  birds,
  breedingLines,
  busy,
  coops,
  eggLogs,
  hatchBatches,
  homestead,
  incubations,
  matingPeriods,
  recordTarget,
  onCreateBreedingLine,
  onCreateMatingPeriod,
  onBulkDeleteBreedingLines,
  onBulkDeleteMatingPeriods,
  onBulkUpdateBreedingLines,
  onBulkUpdateMatingPeriods,
  onDeleteBreedingLine,
  onDeleteMatingPeriod,
  onRecordTargetHandled,
  onUpdateBreedingLine,
  onUpdateMatingPeriod
}: {
  birds: Bird[];
  breedingLines: BreedingLine[];
  busy: boolean;
  coops: Coop[];
  eggLogs: EggLog[];
  hatchBatches: HatchBatch[];
  homestead: Homestead;
  incubations: Incubation[];
  matingPeriods: MatingPeriod[];
  recordTarget?: RecordTarget | null;
  onCreateBreedingLine: (event: FormEvent<HTMLFormElement>) => void;
  onCreateMatingPeriod: (event: FormEvent<HTMLFormElement>) => void;
  onBulkDeleteBreedingLines: (ids: string[]) => Promise<void>;
  onBulkDeleteMatingPeriods: (ids: string[]) => Promise<void>;
  onBulkUpdateBreedingLines: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateMatingPeriods: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onDeleteBreedingLine: (id: string) => void;
  onDeleteMatingPeriod: (id: string) => void;
  onRecordTargetHandled?: () => void;
  onUpdateBreedingLine: (id: string, form: HTMLFormElement) => void;
  onUpdateMatingPeriod: (id: string, form: HTMLFormElement) => void;
}) {
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [selectedBreedingLineIds, setSelectedBreedingLineIds] = useState<string[]>([]);
  const [selectedMatingPeriodIds, setSelectedMatingPeriodIds] = useState<string[]>([]);
  const [bulkLineEditing, setBulkLineEditing] = useState(false);
  const [bulkPeriodEditing, setBulkPeriodEditing] = useState(false);
  const [bulkLineActive, setBulkLineActive] = useState("NO_CHANGE");
  const [bulkLineGoal, setBulkLineGoal] = useState("");
  const [bulkLineNotes, setBulkLineNotes] = useState("");
  const [bulkPeriodLineId, setBulkPeriodLineId] = useState("NO_CHANGE");
  const [bulkPeriodCoopId, setBulkPeriodCoopId] = useState("NO_CHANGE");
  const [bulkPeriodSireId, setBulkPeriodSireId] = useState("NO_CHANGE");
  const [bulkPeriodEndedOn, setBulkPeriodEndedOn] = useState("");
  const [bulkPeriodNotes, setBulkPeriodNotes] = useState("");
  const activeLines = breedingLines.filter((line) => line.active);
  const activePeriods = matingPeriods.filter((period) => !period.ended_on);
  const totalEggsSet = matingPeriods.reduce((sum, period) => sum + numberValue(period.eggs_set), 0);
  const totalFertile = matingPeriods.reduce((sum, period) => sum + numberValue(period.fertile_eggs), 0);
  const totalHatched = matingPeriods.reduce((sum, period) => sum + numberValue(period.hatched_count), 0);
  const activeBirds = birds.filter((bird) => bird.status === "ACTIVE");
  const possibleSires = activeBirds.filter((bird) => bird.sex === "MALE" || bird.sex === "UNKNOWN");
  const possibleHens = activeBirds.filter((bird) => bird.sex === "FEMALE" || bird.sex === "UNKNOWN");
  const selectedLine = breedingLines.find((line) => line.id === selectedLineId) ?? null;
  const selectedPeriod = matingPeriods.find((period) => period.id === selectedPeriodId) ?? null;

  useEffect(() => {
    if (recordTarget?.type === "breedingLine") {
      setSelectedLineId(recordTarget.id);
      setSelectedPeriodId(null);
      onRecordTargetHandled?.();
    }
    if (recordTarget?.type === "matingPeriod") {
      setSelectedPeriodId(recordTarget.id);
      setSelectedLineId(null);
      onRecordTargetHandled?.();
    }
  }, [onRecordTargetHandled, recordTarget]);
  const tableEggValue = preferenceNumber(homestead, "valueTableEgg", 0.35);
  const chickValueSetting = preferenceNumber(homestead, "valueChick", 3);
  const meatValuePerOz = preferenceNumber(homestead, "valueMeatPerOz", 0.5);
  const periodPerformance = matingPeriods
    .map((period) => {
      const periodHatchBatches = hatchBatches.filter((batch) => batch.mating_period_id === period.id);
      const periodBatchIds = new Set(periodHatchBatches.map((batch) => batch.id));
      const periodBirds = birds.filter((bird) => bird.hatch_batch_id != null && periodBatchIds.has(bird.hatch_batch_id));
      const weightedBirds = periodBirds.filter((bird) => bird.current_weight_oz != null);
      const averageWeight = weightedBirds.length
        ? weightedBirds.reduce((sum, bird) => sum + numberValue(bird.current_weight_oz), 0) / weightedBirds.length
        : null;
      const eggValue = eggLogs
        .filter((log) => log.mating_period_id === period.id)
        .reduce((total, log) => total + eggLogValue(log, tableEggValue), 0);
      const chickValue = periodHatchBatches.reduce((total, batch) => {
        const count = numberValue(batch.chick_count) || numberValue(batch.hatched_count);
        return total + count * chickValueSetting;
      }, 0);
      const meatValue = periodBirds
        .filter((bird) => ["PROCESSED", "CULLED"].includes(bird.status))
        .reduce((total, bird) => total + numberValue(bird.current_weight_oz) * meatValuePerOz, 0);

      return {
        period,
        fertility: fertileRate(period.eggs_set, period.fertile_eggs),
        hatchRate: fertileRate(period.eggs_set, period.hatched_count),
        averageWeight,
        offspringCount: periodBirds.length,
        value: eggValue + chickValue + meatValue
      };
    })
    .sort((a, b) => b.value - a.value || numberValue(b.period.hatched_count) - numberValue(a.period.hatched_count))
    .slice(0, 8);
  const allBreedingLinesSelected =
    breedingLines.length > 0 && breedingLines.every((line) => selectedBreedingLineIds.includes(line.id));
  const allMatingPeriodsSelected =
    matingPeriods.length > 0 && matingPeriods.every((period) => selectedMatingPeriodIds.includes(period.id));

  function toggleBreedingLineSelection(id: string) {
    setSelectedBreedingLineIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
    setBulkLineEditing(false);
  }

  function toggleMatingPeriodSelection(id: string) {
    setSelectedMatingPeriodIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
    setBulkPeriodEditing(false);
  }

  async function applyBulkLineEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (bulkLineActive !== "NO_CHANGE") patch.active = bulkLineActive === "true";
    if (bulkLineGoal.trim()) patch.goal = bulkLineGoal.trim();
    if (bulkLineNotes.trim()) patch.notes = bulkLineNotes.trim();
    if (!Object.keys(patch).length) return;
    await onBulkUpdateBreedingLines(selectedBreedingLineIds, patch);
    setSelectedBreedingLineIds([]);
    setBulkLineEditing(false);
    setBulkLineActive("NO_CHANGE");
    setBulkLineGoal("");
    setBulkLineNotes("");
  }

  async function applyBulkPeriodEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (bulkPeriodLineId !== "NO_CHANGE") patch.breedingLineId = bulkPeriodLineId;
    if (bulkPeriodCoopId !== "NO_CHANGE") patch.coopId = bulkPeriodCoopId;
    if (bulkPeriodSireId !== "NO_CHANGE") patch.sireId = bulkPeriodSireId;
    if (bulkPeriodEndedOn) patch.endedOn = bulkPeriodEndedOn;
    if (bulkPeriodNotes.trim()) patch.notes = bulkPeriodNotes.trim();
    if (!Object.keys(patch).length) return;
    await onBulkUpdateMatingPeriods(selectedMatingPeriodIds, patch);
    setSelectedMatingPeriodIds([]);
    setBulkPeriodEditing(false);
    setBulkPeriodLineId("NO_CHANGE");
    setBulkPeriodCoopId("NO_CHANGE");
    setBulkPeriodSireId("NO_CHANGE");
    setBulkPeriodEndedOn("");
    setBulkPeriodNotes("");
  }

  async function applyBulkLineDelete() {
    if (!selectedBreedingLineIds.length) return;
    if (!confirm(`Delete ${selectedBreedingLineIds.length} selected breeding lines?`)) return;
    await onBulkDeleteBreedingLines(selectedBreedingLineIds);
    setSelectedBreedingLineIds([]);
    setBulkLineEditing(false);
  }

  async function applyBulkPeriodDelete() {
    if (!selectedMatingPeriodIds.length) return;
    if (!confirm(`Delete ${selectedMatingPeriodIds.length} selected mating periods?`)) return;
    await onBulkDeleteMatingPeriods(selectedMatingPeriodIds);
    setSelectedMatingPeriodIds([]);
    setBulkPeriodEditing(false);
  }

  if (selectedPeriod) {
    return (
      <MatingPeriodDetail
        birds={birds}
        breedingLines={breedingLines}
        busy={busy}
        coops={coops}
        eggLogs={eggLogs}
        hatchBatches={hatchBatches}
        homestead={homestead}
        incubations={incubations}
        period={selectedPeriod}
        possibleHens={possibleHens}
        possibleSires={possibleSires}
        onBack={() => setSelectedPeriodId(null)}
        onDeleteMatingPeriod={onDeleteMatingPeriod}
        onUpdateMatingPeriod={onUpdateMatingPeriod}
      />
    );
  }

  if (selectedLine) {
    return (
      <BreedingLineDetail
        birds={birds}
        busy={busy}
        eggLogs={eggLogs}
        hatchBatches={hatchBatches}
        homestead={homestead}
        incubations={incubations}
        line={selectedLine}
        matingPeriods={matingPeriods}
        onBack={() => setSelectedLineId(null)}
        onDeleteBreedingLine={onDeleteBreedingLine}
        onOpenMatingPeriod={setSelectedPeriodId}
        onUpdateBreedingLine={onUpdateBreedingLine}
      />
    );
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Breeding</p>
          <h2>Lines and pen mating periods</h2>
          <p className="muted">
            Track a stable breeding line, then record each pen mating period with the known sire and hen
            group. Incubation stats roll up from cycles linked to the mating period.
          </p>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Breeding summary">
        <article className="metric-card">
          <p className="eyebrow">Active lines</p>
          <strong>{activeLines.length}</strong>
          <span>{breedingLines.length} total</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Open periods</p>
          <strong>{activePeriods.length}</strong>
          <span>{matingPeriods.length} total</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Fertility</p>
          <strong>{rateLabel(totalEggsSet ? (totalFertile / totalEggsSet) * 100 : null)}</strong>
          <span>{totalFertile} of {totalEggsSet} eggs</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch rate</p>
          <strong>{rateLabel(totalEggsSet ? (totalHatched / totalEggsSet) * 100 : null)}</strong>
          <span>{totalHatched} hatched</span>
        </article>
      </section>

      <section className="subpanel">
        <p className="eyebrow">Comparison</p>
        <h3>Mating period performance</h3>
        {periodPerformance.length ? (
          <div className="performance-table">
            <div className="performance-row performance-head">
              <span>Period</span>
              <span>Fertility</span>
              <span>Hatch</span>
              <span>Avg weight</span>
              <span>Offspring</span>
              <span>Value</span>
              <span />
            </div>
            {periodPerformance.map((row) => (
              <div className="performance-row" key={row.period.id}>
                <div>
                  <strong>{row.period.label}</strong>
                  <small>
                    {row.period.breeding_line_name} · {displayDate(row.period.started_on)} to {row.period.ended_on ? displayDate(row.period.ended_on) : "current"}
                  </small>
                </div>
                <span>{rateLabel(row.fertility)}</span>
                <span>{rateLabel(row.hatchRate)}</span>
                <span>{row.averageWeight == null ? "No weights" : `${row.averageWeight.toFixed(1)} oz`}</span>
                <span>{row.offspringCount}</span>
                <span>{money(row.value)}</span>
                <button className="secondary" type="button" onClick={() => setSelectedPeriodId(row.period.id)}>
                  Open
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">
            Add mating periods, incubation outcomes, and offspring weights to compare fertility, hatch rate, growth, and value.
          </p>
        )}
        <p className="muted compact-copy">
          Growth uses current offspring weights for now. As more age-based weight logs accumulate, this can evolve into an age-adjusted period comparison.
        </p>
      </section>

      <div className="feed-layout">
        <CreateRecordPanel
          buttonLabel="Create breeding line"
          eyebrow="Line"
          title="Create breeding line"
          description="Use lines for long-running genetic goals, not every temporary pen arrangement."
        >
          <form className="feed-form" onSubmit={onCreateBreedingLine}>
            <label>
              Line name
              <input name="name" required placeholder="Line A" />
            </label>
            <label>
              Goal
              <input name="goal" placeholder="Eggs, meat, temperament, color, etc." />
            </label>
            <label className="wide-field">
              Notes
              <input name="notes" placeholder="Foundation stock, traits to watch, pairing strategy..." />
            </label>
            <button disabled={busy} type="submit">
              {busy ? "Saving..." : "Add line"}
            </button>
          </form>
        </CreateRecordPanel>

        <CreateRecordPanel
          buttonLabel="Create mating period"
          eyebrow="Period"
          title="Create mating period"
          description="Create a mating period when the sire, hen group, coop, or dates define a known breeding window."
        >
          <form className="feed-form" onSubmit={onCreateMatingPeriod}>
            <label>
              Breeding line
              <BreedingLineSelect breedingLines={breedingLines} required />
            </label>
            <label>
              Label
              <input name="label" required placeholder="Line A Pen 1, June" />
            </label>
            <label>
              Coop
              <CoopSelect coops={coops} />
            </label>
            <label>
              Sire
              <SireSelect birds={possibleSires} />
            </label>
            <label>
              Start date
              <input name="startedOn" required type="date" defaultValue={dateKeyDaysAgo(0)} />
            </label>
            <label>
              End date
              <input name="endedOn" type="date" />
            </label>
            <label className="wide-field">
              Hen group
              <HenCheckboxes birds={possibleHens} />
            </label>
            <label className="wide-field">
              Notes
              <input name="notes" placeholder="Rotations, aggression, fertility observations..." />
            </label>
            <button disabled={busy || !breedingLines.length} type="submit">
              {busy ? "Saving..." : "Add period"}
            </button>
          </form>
        </CreateRecordPanel>
      </div>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Lines</p>
            <h3>Breeding lines</h3>
            <p className="muted compact-copy">Long-running genetic goals and the mating periods attached to them.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="table-control-panel">
            <div className="bulk-actions table-bulk-actions" aria-label="Bulk breeding line actions">
              <label className="table-select-cell select-all-card" aria-label="Select all breeding lines">
                <input
                  checked={allBreedingLinesSelected}
                  type="checkbox"
                  onChange={(event) => {
                    setSelectedBreedingLineIds(event.target.checked ? breedingLines.map((line) => line.id) : []);
                    setBulkLineEditing(false);
                  }}
                />
              </label>
              <span>
                {selectedBreedingLineIds.length > 1
                  ? `${selectedBreedingLineIds.length} selected`
                  : selectedBreedingLineIds.length === 1
                    ? "Select one more for bulk actions"
                    : "Select lines for bulk actions"}
              </span>
              {selectedBreedingLineIds.length > 1 ? (
                <>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkLineEditing((current) => !current)}>
                    Edit
                  </button>
                  <button className="danger" disabled={busy} type="button" onClick={applyBulkLineDelete}>
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            {bulkLineEditing && selectedBreedingLineIds.length > 1 ? (
              <form className="bulk-edit-form" onSubmit={applyBulkLineEdit}>
                <div>
                  <p className="eyebrow">Bulk edit</p>
                  <strong>Update {selectedBreedingLineIds.length} selected lines</strong>
                  <span>Fields left as no change will be skipped.</span>
                </div>
                <label>
                  Status
                  <select value={bulkLineActive} onChange={(event) => setBulkLineActive(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </label>
                <label>
                  Goal
                  <input placeholder="No change" value={bulkLineGoal} onChange={(event) => setBulkLineGoal(event.target.value)} />
                </label>
                <label>
                  Notes
                  <input placeholder="No change" value={bulkLineNotes} onChange={(event) => setBulkLineNotes(event.target.value)} />
                </label>
                <div className="row-actions">
                  <button
                    disabled={busy || (bulkLineActive === "NO_CHANGE" && !bulkLineGoal.trim() && !bulkLineNotes.trim())}
                    type="submit"
                  >
                    Apply changes
                  </button>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkLineEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          <div className="cycle-list">
          {breedingLines.length ? (
            breedingLines.map((line) =>
              editingLineId === line.id ? (
                <form
                  className="cycle-card edit-cycle-card"
                  key={line.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    onUpdateBreedingLine(line.id, event.currentTarget);
                    setEditingLineId(null);
                  }}
                >
                  <label>
                    Line name
                    <input name="name" required defaultValue={line.name} />
                  </label>
                  <label>
                    Goal
                    <input name="goal" defaultValue={line.goal ?? ""} />
                  </label>
                  <label>
                    Status
                    <select name="active" defaultValue={line.active ? "true" : "false"}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </label>
                  <label className="wide-field">
                    Notes
                    <input name="notes" defaultValue={line.notes ?? ""} />
                  </label>
                  <div className="row-actions">
                    <button disabled={busy} type="submit">Save</button>
                    <button className="secondary" disabled={busy} type="button" onClick={() => setEditingLineId(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <article
                  className="cycle-card clickable-row"
                  key={line.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedLineId(line.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedLineId(line.id);
                  }}
                >
                  <label className="table-select-cell card-select" aria-label={`Select ${line.name}`} onClick={(event) => event.stopPropagation()}>
                    <input
                      checked={selectedBreedingLineIds.includes(line.id)}
                      type="checkbox"
                      onChange={() => toggleBreedingLineSelection(line.id)}
                    />
                  </label>
                  <div className="cycle-card-head">
                    <div>
                      <strong>{line.name}</strong>
                      <p>{line.goal || "No goal recorded yet."}</p>
                    </div>
                    <span className="row-open-hint">Open</span>
                  </div>
                  <div className="pill-row">
                    <span>{line.active ? "Active" : "Inactive"}</span>
                    <span>{line.mating_period_count} periods</span>
                    <span>{rateLabel(fertileRate(line.eggs_set, line.fertile_eggs))} fertile</span>
                    <span>{rateLabel(fertileRate(line.eggs_set, line.hatched_count))} hatch</span>
                    <span>{line.notes || "No notes"}</span>
                  </div>
                </article>
              )
            )
          ) : (
            <div className="empty-state">
              <h3>No breeding lines yet</h3>
              <p>Create a line before adding mating periods.</p>
            </div>
          )}
        </div>
        </div>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Periods</p>
            <h3>Pen mating periods</h3>
            <p className="muted compact-copy">Temporary sire and hen-group windows that roll up fertility, hatch, and offspring stats.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="table-control-panel">
            <div className="bulk-actions table-bulk-actions" aria-label="Bulk mating period actions">
              <label className="table-select-cell select-all-card" aria-label="Select all mating periods">
                <input
                  checked={allMatingPeriodsSelected}
                  type="checkbox"
                  onChange={(event) => {
                    setSelectedMatingPeriodIds(event.target.checked ? matingPeriods.map((period) => period.id) : []);
                    setBulkPeriodEditing(false);
                  }}
                />
              </label>
              <span>
                {selectedMatingPeriodIds.length > 1
                  ? `${selectedMatingPeriodIds.length} selected`
                  : selectedMatingPeriodIds.length === 1
                    ? "Select one more for bulk actions"
                    : "Select periods for bulk actions"}
              </span>
              {selectedMatingPeriodIds.length > 1 ? (
                <>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkPeriodEditing((current) => !current)}>
                    Edit
                  </button>
                  <button className="danger" disabled={busy} type="button" onClick={applyBulkPeriodDelete}>
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            {bulkPeriodEditing && selectedMatingPeriodIds.length > 1 ? (
              <form className="bulk-edit-form" onSubmit={applyBulkPeriodEdit}>
                <div>
                  <p className="eyebrow">Bulk edit</p>
                  <strong>Update {selectedMatingPeriodIds.length} selected periods</strong>
                  <span>Fields left as no change will be skipped.</span>
                </div>
                <label>
                  Breeding line
                  <select value={bulkPeriodLineId} onChange={(event) => setBulkPeriodLineId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    {breedingLines.map((line) => (
                      <option key={line.id} value={line.id}>{line.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Coop
                  <select value={bulkPeriodCoopId} onChange={(event) => setBulkPeriodCoopId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    {coops.map((coop) => (
                      <option key={coop.id} value={coop.id}>{coop.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Sire
                  <select value={bulkPeriodSireId} onChange={(event) => setBulkPeriodSireId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    {possibleSires.map((bird) => (
                      <option key={bird.id} value={bird.id}>{birdLabel(bird)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  End date
                  <input type="date" value={bulkPeriodEndedOn} onChange={(event) => setBulkPeriodEndedOn(event.target.value)} />
                </label>
                <label>
                  Notes
                  <input placeholder="No change" value={bulkPeriodNotes} onChange={(event) => setBulkPeriodNotes(event.target.value)} />
                </label>
                <div className="row-actions">
                  <button
                    disabled={
                      busy ||
                      (bulkPeriodLineId === "NO_CHANGE" &&
                        bulkPeriodCoopId === "NO_CHANGE" &&
                        bulkPeriodSireId === "NO_CHANGE" &&
                        !bulkPeriodEndedOn &&
                        !bulkPeriodNotes.trim())
                    }
                    type="submit"
                  >
                    Apply changes
                  </button>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkPeriodEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          <div className="cycle-list">
          {matingPeriods.length ? (
            matingPeriods.map((period) =>
              editingPeriodId === period.id ? (
                <form
                  className="cycle-card edit-cycle-card"
                  key={period.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    onUpdateMatingPeriod(period.id, event.currentTarget);
                    setEditingPeriodId(null);
                  }}
                >
                  <label>
                    Breeding line
                    <BreedingLineSelect breedingLines={breedingLines} defaultValue={period.breeding_line_id} required />
                  </label>
                  <label>
                    Label
                    <input name="label" required defaultValue={period.label} />
                  </label>
                  <label>
                    Coop
                    <CoopSelect coops={coops} defaultValue={period.coop_id ?? ""} />
                  </label>
                  <label>
                    Sire
                    <SireSelect birds={possibleSires} defaultValue={period.sire_id ?? ""} />
                  </label>
                  <label>
                    Start date
                    <input name="startedOn" required type="date" defaultValue={normalizeDateKey(period.started_on)} />
                  </label>
                  <label>
                    End date
                    <input name="endedOn" type="date" defaultValue={normalizeDateKey(period.ended_on)} />
                  </label>
                  <label className="wide-field">
                    Hen group
                    <HenCheckboxes birds={possibleHens} selectedIds={period.hens.map((hen) => hen.id)} />
                  </label>
                  <label className="wide-field">
                    Notes
                    <input name="notes" defaultValue={period.notes ?? ""} />
                  </label>
                  <div className="row-actions">
                    <button disabled={busy} type="submit">Save</button>
                    <button className="secondary" disabled={busy} type="button" onClick={() => setEditingPeriodId(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <article
                  className="cycle-card clickable-row"
                  key={period.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPeriodId(period.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedPeriodId(period.id);
                  }}
                >
                  <label className="table-select-cell card-select" aria-label={`Select ${period.label}`} onClick={(event) => event.stopPropagation()}>
                    <input
                      checked={selectedMatingPeriodIds.includes(period.id)}
                      type="checkbox"
                      onChange={() => toggleMatingPeriodSelection(period.id)}
                    />
                  </label>
                  <div className="cycle-card-head">
                    <div>
                      <strong>{period.label}</strong>
                      <p>
                        {period.breeding_line_name} · {period.coop_name || "No coop"} · sire {period.sire_label || "unknown"}
                      </p>
                    </div>
                    <span className="row-open-hint">Open</span>
                  </div>
                  <div className="pill-row">
                    <span>{displayDate(period.started_on)} to {period.ended_on ? displayDate(period.ended_on) : "current"}</span>
                    <span>{period.hen_count} hens: {period.hens.map((hen) => hen.label).join(", ") || "none selected"}</span>
                    <span>{period.incubation_count} incubations</span>
                    <span>{rateLabel(fertileRate(period.eggs_set, period.fertile_eggs))} fertile</span>
                    <span>{rateLabel(fertileRate(period.eggs_set, period.hatched_count))} hatch</span>
                    <span>{period.notes || "No notes"}</span>
                  </div>
                </article>
              )
            )
          ) : (
            <div className="empty-state">
              <h3>No mating periods yet</h3>
              <p>Create a period when a sire and hen group are together in a breeding coop.</p>
            </div>
          )}
        </div>
        </div>
      </section>
    </section>
  );
}

function MatingPeriodDetail({
  birds,
  breedingLines,
  busy,
  coops,
  eggLogs,
  hatchBatches,
  homestead,
  incubations,
  period,
  possibleHens,
  possibleSires,
  onBack,
  onDeleteMatingPeriod,
  onUpdateMatingPeriod
}: {
  birds: Bird[];
  breedingLines: BreedingLine[];
  busy: boolean;
  coops: Coop[];
  eggLogs: EggLog[];
  hatchBatches: HatchBatch[];
  homestead: Homestead;
  incubations: Incubation[];
  period: MatingPeriod;
  possibleHens: Bird[];
  possibleSires: Bird[];
  onBack: () => void;
  onDeleteMatingPeriod: (id: string) => void;
  onUpdateMatingPeriod: (id: string, form: HTMLFormElement) => void;
}) {
  const periodIncubations = incubations.filter((cycle) => cycle.mating_period_id === period.id);
  const periodHatchBatches = hatchBatches.filter((batch) => batch.mating_period_id === period.id);
  const periodBatchIds = new Set(periodHatchBatches.map((batch) => batch.id));
  const periodBirds = birds.filter((bird) => bird.hatch_batch_id != null && periodBatchIds.has(bird.hatch_batch_id));
  const activePeriodBirds = periodBirds.filter((bird) => bird.status === "ACTIVE");
  const eggsSet = numberValue(period.eggs_set);
  const fertileEggs = numberValue(period.fertile_eggs);
  const hatchedCount = numberValue(period.hatched_count);
  const fertility = fertileRate(period.eggs_set, period.fertile_eggs);
  const hatchRate = fertileRate(period.eggs_set, period.hatched_count);
  const hatchFromFertile = fertileRate(period.fertile_eggs, period.hatched_count);
  const tableEggValue = preferenceNumber(homestead, "valueTableEgg", 0.35);
  const chickValueSetting = preferenceNumber(homestead, "valueChick", 3);
  const meatValuePerOz = preferenceNumber(homestead, "valueMeatPerOz", 0.5);
  const periodEggLogs = eggLogs.filter((log) => log.mating_period_id === period.id);
  const eggValue = periodEggLogs.reduce((total, log) => total + eggLogValue(log, tableEggValue), 0);
  const chickValue = periodHatchBatches.reduce((total, batch) => {
    const count = numberValue(batch.chick_count) || numberValue(batch.hatched_count);
    return total + count * chickValueSetting;
  }, 0);
  const meatValue = periodBirds
    .filter((bird) => ["PROCESSED", "CULLED"].includes(bird.status))
    .reduce((total, bird) => total + numberValue(bird.current_weight_oz) * meatValuePerOz, 0);
  const lifetimeValue = eggValue + chickValue + meatValue;
  const maxValueBar = Math.max(1, eggValue, chickValue, meatValue);
  const recommendations = [
    !period.ended_on ? "This mating period is open. Close it when the sire or hen group changes." : null,
    !period.sire_id ? "No sire is linked. Add the sire if this period should support lineage tracking." : null,
    numberValue(period.hen_count) === 0 ? "No hens are linked. Add the hen group so offspring lineage is useful." : null,
    eggsSet && fertility != null && fertility < 70
      ? "Fertility is under 70%. Review the sire, hen condition, ratio, and egg handling for this exact pen period."
      : null,
    fertileEggs && hatchFromFertile != null && hatchFromFertile < 75
      ? "Hatch from fertile eggs is low. Compare this period's incubation parameters against better periods."
      : null
  ].filter(Boolean) as string[];

  return (
    <section className="panel detail-page">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Mating period detail</p>
          <h2>{period.label}</h2>
          <p className="muted">
            {period.breeding_line_name} · {period.coop_name || "No coop"} · sire {period.sire_label || "unknown"}
          </p>
        </div>
        <div className="detail-header-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Back
          </button>
          <button
            className="danger"
            disabled={busy}
            type="button"
            onClick={() => {
              if (confirm(`Delete ${period.label}?`)) {
                onDeleteMatingPeriod(period.id);
                onBack();
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Mating period summary">
        <article className="metric-card">
          <p className="eyebrow">Status</p>
          <strong>
            <span className={`status-chip ${period.ended_on ? "closed" : "open"}`}>{period.ended_on ? "Closed" : "Open"}</span>
          </strong>
          <span>{displayDate(period.started_on)} to {period.ended_on ? displayDate(period.ended_on) : "current"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hen group</p>
          <strong>{period.hen_count}</strong>
          <span>{period.hens.map((hen) => hen.label).join(", ") || "none selected"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Fertility</p>
          <strong>{rateLabel(fertility)}</strong>
          <span>{fertileEggs} of {eggsSet} eggs</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch rate</p>
          <strong>{rateLabel(hatchRate)}</strong>
          <span>{hatchedCount} hatched</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Incubations</p>
          <strong>{periodIncubations.length}</strong>
          <span>{periodHatchBatches.length} hatch batches</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Tracked value</p>
          <strong>{money(lifetimeValue)}</strong>
          <span>{activePeriodBirds.length} active offspring records</span>
        </article>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Economics</p>
            <h3>Period value breakdown</h3>
            <p className="muted compact-copy">Estimated value from eggs, hatch batches, and processed offspring records.</p>
          </div>
        </div>
        <div className="table-card value-card">
          <div className="value-chart" aria-label="Mating period value chart">
            {[
              { label: "Egg value", value: eggValue, tone: "positive" },
              { label: "Chick value", value: chickValue, tone: "positive" },
              { label: "Meat value", value: meatValue, tone: "positive" }
            ].map((item) => (
              <article key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{money(item.value)}</span>
                </div>
                <div className="value-bar-track">
                  <div
                    className={`value-bar-fill ${item.tone}`}
                    style={{ width: `${Math.max(3, (item.value / maxValueBar) * 100)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Recommendations</p>
            <h3>Period signals</h3>
            <p className="muted compact-copy">Specific to this sire and hen group window.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          {recommendations.length ? (
            <div className="source-summary record-card-list">
              {recommendations.map((recommendation) => (
                <article key={recommendation}>
                  <div>
                    <strong>{recommendation}</strong>
                    <span>Specific to this sire and hen group window.</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No urgent signals</h3>
              <p>No urgent period-level recommendations yet.</p>
            </div>
          )}
        </div>
      </section>

      <div className="feed-layout">
        <section className="subpanel">
          <p className="eyebrow">Incubations</p>
          <h3>Cycles from this period</h3>
          {periodIncubations.length ? (
            <div className="source-summary">
              {periodIncubations.map((cycle) => (
                <article key={cycle.id}>
                  <div>
                    <strong>{cycle.label}</strong>
                    <span>
                      {displayDate(cycle.set_date)} · {cycle.eggs_set} set · {rateLabel(fertileRate(cycle.eggs_set, cycle.fertile_eggs))} fertile ·{" "}
                      {rateLabel(fertileRate(cycle.eggs_set, cycle.hatched_count))} hatch
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No incubation cycles are linked to this period yet.</p>
          )}
        </section>

        <section className="subpanel">
          <p className="eyebrow">Offspring</p>
          <h3>Bird records from this period</h3>
          {periodBirds.length ? (
            <div className="source-summary">
              {periodBirds.slice(0, 8).map((bird) => (
                <article key={bird.id}>
                  <div>
                    <strong>{birdLabel(bird)}</strong>
                    <span>
                      {formatBirdSex(bird.sex)} · {formatBirdStatus(bird.status)} · {bird.current_weight_oz ? `${bird.current_weight_oz} oz` : "no weight yet"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No bird records have been created from this period yet.</p>
          )}
        </section>
      </div>

      <CreateRecordPanel buttonLabel="Edit mating period" eyebrow="Record" title="Edit mating period">
        <form
          className="feed-form"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateMatingPeriod(period.id, event.currentTarget);
          }}
        >
          <label>
            Breeding line
            <BreedingLineSelect breedingLines={breedingLines} defaultValue={period.breeding_line_id} required />
          </label>
          <label>
            Label
            <input name="label" required defaultValue={period.label} />
          </label>
          <label>
            Coop
            <CoopSelect coops={coops} defaultValue={period.coop_id ?? ""} />
          </label>
          <label>
            Sire
            <SireSelect birds={possibleSires} defaultValue={period.sire_id ?? ""} />
          </label>
          <label>
            Start date
            <input name="startedOn" required type="date" defaultValue={normalizeDateKey(period.started_on)} />
          </label>
          <label>
            End date
            <input name="endedOn" type="date" defaultValue={normalizeDateKey(period.ended_on)} />
          </label>
          <label className="wide-field">
            Hen group
            <HenCheckboxes birds={possibleHens} selectedIds={period.hens.map((hen) => hen.id)} />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" defaultValue={period.notes ?? ""} />
          </label>
          <div className="row-actions">
            <button disabled={busy} type="submit">Save period</button>
          </div>
        </form>
      </CreateRecordPanel>
    </section>
  );
}

function BreedingLineDetail({
  birds,
  busy,
  eggLogs,
  hatchBatches,
  homestead,
  incubations,
  line,
  matingPeriods,
  onBack,
  onDeleteBreedingLine,
  onOpenMatingPeriod,
  onUpdateBreedingLine
}: {
  birds: Bird[];
  busy: boolean;
  eggLogs: EggLog[];
  hatchBatches: HatchBatch[];
  homestead: Homestead;
  incubations: Incubation[];
  line: BreedingLine;
  matingPeriods: MatingPeriod[];
  onBack: () => void;
  onDeleteBreedingLine: (id: string) => void;
  onOpenMatingPeriod: (id: string) => void;
  onUpdateBreedingLine: (id: string, form: HTMLFormElement) => void;
}) {
  const linePeriods = matingPeriods.filter((period) => period.breeding_line_id === line.id);
  const linePeriodIds = new Set(linePeriods.map((period) => period.id));
  const lineIncubations = incubations.filter(
    (cycle) => cycle.mating_period_id != null && linePeriodIds.has(cycle.mating_period_id)
  );
  const lineHatchBatches = hatchBatches.filter(
    (batch) =>
      batch.breeding_line_id === line.id ||
      (batch.mating_period_id != null && linePeriodIds.has(batch.mating_period_id))
  );
  const lineBirds = birds.filter((bird) => bird.breeding_line_id === line.id);
  const activeLineBirds = lineBirds.filter((bird) => bird.status === "ACTIVE");
  const eggsSet = linePeriods.reduce((sum, period) => sum + numberValue(period.eggs_set), 0);
  const fertileEggs = linePeriods.reduce((sum, period) => sum + numberValue(period.fertile_eggs), 0);
  const hatchedCount = linePeriods.reduce((sum, period) => sum + numberValue(period.hatched_count), 0);
  const fertility = eggsSet ? (fertileEggs / eggsSet) * 100 : null;
  const hatchRate = eggsSet ? (hatchedCount / eggsSet) * 100 : null;
  const hatchFromFertileRate = fertileEggs ? (hatchedCount / fertileEggs) * 100 : null;
  const tableEggValue = preferenceNumber(homestead, "valueTableEgg", 0.35);
  const chickValueSetting = preferenceNumber(homestead, "valueChick", 3);
  const meatValuePerOz = preferenceNumber(homestead, "valueMeatPerOz", 0.5);
  const lineEggLogs = eggLogs.filter(
    (log) => log.breeding_line_id === line.id || (log.mating_period_id != null && linePeriodIds.has(log.mating_period_id))
  );
  const eggValue = lineEggLogs.reduce((total, log) => total + eggLogValue(log, tableEggValue), 0);
  const chickValue = lineHatchBatches.reduce((total, batch) => {
    const count = numberValue(batch.chick_count) || numberValue(batch.hatched_count);
    return total + count * chickValueSetting;
  }, 0);
  const meatValue = lineBirds
    .filter((bird) => ["PROCESSED", "CULLED"].includes(bird.status))
    .reduce((total, bird) => total + numberValue(bird.current_weight_oz) * meatValuePerOz, 0);
  const lifetimeValue = eggValue + chickValue + meatValue;
  const maxValueBar = Math.max(1, eggValue, chickValue, meatValue);
  const activeSireIds = new Set(
    linePeriods
      .filter((period) => !period.ended_on && period.sire_id)
      .map((period) => period.sire_id as string)
  );
  const breederCandidates = activeLineBirds
    .filter((bird) => bird.sex === "FEMALE" || bird.sex === "MALE")
    .slice(0, 6);
  const processCandidates = activeLineBirds
    .filter((bird) => bird.sex === "MALE" && !activeSireIds.has(bird.id))
    .slice(0, 6);
  const recommendations = [
    !line.active ? "Line is inactive. Keep it archived unless you plan to restart this family." : null,
    line.active && !linePeriods.some((period) => !period.ended_on)
      ? "No open mating period. Open one when this line is back in a breeding pen."
      : null,
    eggsSet && fertility != null && fertility < 70
      ? "Fertility is under 70%. Review sire condition, hen group age, ratio, and egg handling."
      : null,
    fertileEggs && hatchFromFertileRate != null && hatchFromFertileRate < 75
      ? "Hatch from fertile eggs is low. Compare incubation temperature, humidity, turning, and lockdown notes."
      : null,
    processCandidates.length
      ? `${processCandidates.length} active male ${processCandidates.length === 1 ? "bird is" : "birds are"} not serving as an open-period sire. Review for processing or sale if not needed.`
      : null,
    lifetimeValue > 0 && hatchRate != null && hatchRate >= 70
      ? "This line is showing usable hatch performance and recorded value. Keep tracking offspring growth before making final breeder picks."
      : null
  ].filter(Boolean) as string[];

  return (
    <section className="panel detail-page">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Breeding line detail</p>
          <h2>{line.name}</h2>
          <p className="muted">{line.goal || "No line goal recorded yet."}</p>
        </div>
        <div className="detail-header-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Back to breeding
          </button>
          <button
            className="danger"
            disabled={busy}
            type="button"
            onClick={() => {
              if (confirm(`Delete ${line.name}?`)) {
                onDeleteBreedingLine(line.id);
                onBack();
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Breeding line summary">
        <article className="metric-card">
          <p className="eyebrow">Status</p>
          <strong>
            <span className={`status-chip ${line.active ? "active" : "inactive"}`}>{line.active ? "Active" : "Inactive"}</span>
          </strong>
          <span>{linePeriods.length} mating periods</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Fertility</p>
          <strong>{rateLabel(fertility)}</strong>
          <span>{fertileEggs} of {eggsSet} eggs</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch rate</p>
          <strong>{rateLabel(hatchRate)}</strong>
          <span>{hatchedCount} hatched</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Incubations</p>
          <strong>{lineIncubations.length}</strong>
          <span>{lineHatchBatches.length} hatch batches</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Bird records</p>
          <strong>{activeLineBirds.length}</strong>
          <span>{lineBirds.length} total from this line</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Tracked value</p>
          <strong>{money(lifetimeValue)}</strong>
          <span>eggs, chicks, and meat</span>
        </article>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Economics</p>
            <h3>Line value breakdown</h3>
            <p className="muted compact-copy">
              Line value uses linked egg logs, hatch batch chick counts, and processed/cull bird weights.
            </p>
          </div>
        </div>
        <div className="table-card value-card">
          <div className="value-chart" aria-label="Breeding line value chart">
            {[
              { label: "Egg value", value: eggValue, tone: "positive" },
              { label: "Chick value", value: chickValue, tone: "positive" },
              { label: "Meat value", value: meatValue, tone: "positive" }
            ].map((item) => (
              <article key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{money(item.value)}</span>
                </div>
                <div className="value-bar-track">
                  <div
                    className={`value-bar-fill ${item.tone}`}
                    style={{ width: `${Math.max(3, (item.value / maxValueBar) * 100)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Recommendations</p>
            <h3>Breeder and process signals</h3>
            <p className="muted compact-copy">Based on this line's current records.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          {recommendations.length ? (
            <div className="source-summary record-card-list">
              {recommendations.map((recommendation) => (
                <article key={recommendation}>
                  <div>
                    <strong>{recommendation}</strong>
                    <span>Based on this line's current records.</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No urgent signals</h3>
              <p>No urgent line-level recommendations yet. More records will make this smarter.</p>
            </div>
          )}
        </div>
      </section>

      <div className="feed-layout">
        <section className="subpanel">
          <p className="eyebrow">Keep for breeding</p>
          <h3>Candidate birds from this line</h3>
          {breederCandidates.length ? (
            <div className="source-summary">
              {breederCandidates.map((bird) => (
                <article key={bird.id}>
                  <div>
                    <strong>{birdLabel(bird)}</strong>
                    <span>
                      {formatBirdSex(bird.sex)} · {bird.current_weight_oz ? `${bird.current_weight_oz} oz` : "no weight yet"} · {bird.coop_name || "no coop"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No active sexed birds from this line yet.</p>
          )}
        </section>

        <section className="subpanel">
          <p className="eyebrow">Review for meat/sale</p>
          <h3>Extra active males</h3>
          {processCandidates.length ? (
            <div className="source-summary">
              {processCandidates.map((bird) => (
                <article key={bird.id}>
                  <div>
                    <strong>{birdLabel(bird)}</strong>
                    <span>
                      Not an open-period sire · {bird.current_weight_oz ? `${bird.current_weight_oz} oz` : "no weight yet"} · {bird.coop_name || "no coop"}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No obvious extra male records in this line.</p>
          )}
        </section>
      </div>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Mating periods</p>
            <h3>Periods under this line</h3>
            <p className="muted compact-copy">{linePeriods.length} mating periods roll up to this breeding line.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="cycle-list">
            {linePeriods.length ? (
              linePeriods.map((period) => (
                <article
                  className="cycle-card clickable-row"
                  key={period.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenMatingPeriod(period.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onOpenMatingPeriod(period.id);
                  }}
                >
                  <div className="cycle-card-head">
                    <div>
                      <strong>{period.label}</strong>
                      <p>
                        {period.coop_name || "No coop"} · sire {period.sire_label || "unknown"} ·{" "}
                        {displayDate(period.started_on)} to {period.ended_on ? displayDate(period.ended_on) : "current"}
                      </p>
                    </div>
                    <span className="row-open-hint">Open</span>
                  </div>
                  <div className="pill-row">
                    <span>{period.hen_count} hens: {period.hens.map((hen) => hen.label).join(", ") || "none selected"}</span>
                    <span>{period.incubation_count} incubations</span>
                    <span>{rateLabel(fertileRate(period.eggs_set, period.fertile_eggs))} fertile</span>
                    <span>{rateLabel(fertileRate(period.eggs_set, period.hatched_count))} hatch</span>
                    <span>{period.notes || "No notes"}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <h3>No mating periods yet</h3>
                <p>Create a period when this line is placed into a breeding pen.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <CreateRecordPanel buttonLabel="Edit breeding line" eyebrow="Record" title="Edit breeding line">
        <form
          className="feed-form"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateBreedingLine(line.id, event.currentTarget);
          }}
        >
          <label>
            Line name
            <input name="name" required defaultValue={line.name} />
          </label>
          <label>
            Goal
            <input name="goal" defaultValue={line.goal ?? ""} />
          </label>
          <label>
            Status
            <select name="active" defaultValue={line.active ? "true" : "false"}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" defaultValue={line.notes ?? ""} />
          </label>
          <div className="row-actions">
            <button disabled={busy} type="submit">Save line</button>
          </div>
        </form>
      </CreateRecordPanel>
    </section>
  );
}

function SettingsManager({
  busy,
  coops,
  homestead,
  managedUsers,
  user,
  onCreateManagedUser,
  onDisableManagedUser,
  onDisableMfa,
  onEnableMfa,
  onExportData,
  onImportBundle,
  onImportData,
  onSettings,
  onStartMfaSetup,
  onUpdateManagedUser
}: {
  busy: boolean;
  coops: Coop[];
  homestead: Homestead;
  managedUsers: ManagedUser[];
  user: User;
  onCreateManagedUser: (event: FormEvent<HTMLFormElement>) => void;
  onDisableManagedUser: (id: string) => void;
  onDisableMfa: (event: FormEvent<HTMLFormElement>) => void;
  onEnableMfa: (event: FormEvent<HTMLFormElement>) => void;
  onExportData: (format?: "json" | "bundle", includePhotos?: boolean) => void;
  onImportBundle: (dataUrl: string, options: RestoreOptions) => Promise<void>;
  onImportData: (data: unknown, options: RestoreOptions) => Promise<void>;
  onSettings: (event: FormEvent<HTMLFormElement>) => void;
  onStartMfaSetup: () => Promise<MfaSetup | null>;
  onUpdateManagedUser: (id: string, form: HTMLFormElement) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("homestead");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importData, setImportData] = useState<unknown | null>(null);
  const [importPreviewError, setImportPreviewError] = useState("");
  const [bundlePreview, setBundlePreview] = useState<BundlePreviewResult | null>(null);
  const [bundleDataUrl, setBundleDataUrl] = useState("");
  const [backupExportMode, setBackupExportMode] = useState<"records" | "all">("all");
  const [restoreScope, setRestoreScope] = useState<RestoreScope>("all");
  const [conflictMode, setConflictMode] = useState<ConflictMode>("skip");
  const [replaceConfirmation, setReplaceConfirmation] = useState("");
  const [previewingImport, setPreviewingImport] = useState(false);
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [backupError, setBackupError] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupFrequency, setBackupFrequency] = useState<BackupSettings["frequency"]>("weekly");
  const [backupDayOfWeek, setBackupDayOfWeek] = useState(1);
  const [backupDayOfMonth, setBackupDayOfMonth] = useState(1);
  const [backupTimeOfDay, setBackupTimeOfDay] = useState("02:00");
  const [backupRetentionCount, setBackupRetentionCount] = useState(12);

  async function loadBackupStatus() {
    setBackupError("");
    try {
      const result = await apiRequest<{ backups: BackupStatus }>("/data/backups");
      setBackupStatus(result.backups);
      setBackupEnabled(result.backups.settings.enabled);
      setBackupFrequency(result.backups.settings.frequency);
      setBackupDayOfWeek(result.backups.settings.dayOfWeek);
      setBackupDayOfMonth(result.backups.settings.dayOfMonth);
      setBackupTimeOfDay(result.backups.settings.timeOfDay);
      setBackupRetentionCount(result.backups.settings.retentionCount);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Could not load backup status.");
    }
  }

  useEffect(() => {
    if (tab === "data") void loadBackupStatus();
  }, [tab]);

  async function handleSaveBackupSettings() {
    setBackupBusy(true);
    setBackupError("");
    try {
      await apiRequest<{ ok: true }>("/homestead", {
        method: "PATCH",
        body: JSON.stringify({
          preferences: {
            backupSchedule: {
              enabled: backupEnabled,
              frequency: backupFrequency,
              dayOfWeek: backupDayOfWeek,
              dayOfMonth: backupDayOfMonth,
              timeOfDay: backupTimeOfDay,
              retentionCount: backupRetentionCount
            }
          }
        })
      });
      await loadBackupStatus();
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Could not save backup settings.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleRunBackupNow() {
    setBackupBusy(true);
    setBackupError("");
    try {
      const result = await apiRequest<{ backups: BackupStatus }>("/data/backups/run", { method: "POST" });
      setBackupStatus(result.backups);
      setBackupEnabled(result.backups.settings.enabled);
      setBackupFrequency(result.backups.settings.frequency);
      setBackupDayOfWeek(result.backups.settings.dayOfWeek);
      setBackupDayOfMonth(result.backups.settings.dayOfMonth);
      setBackupTimeOfDay(result.backups.settings.timeOfDay);
      setBackupRetentionCount(result.backups.settings.retentionCount);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Could not run backup.");
      await loadBackupStatus();
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleDownloadBackup(backup: BackupRun) {
    if (!backup.file_name) return;
    setBackupBusy(true);
    setBackupError("");
    try {
      const response = await fetch(`${apiUrl}/data/backups/${backup.id}/download`, { credentials: "include" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(body.message ?? "Could not download backup.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = backup.file_name;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : "Could not download backup.");
    } finally {
      setBackupBusy(false);
    }
  }

  function applyCoturnixIncubationDefaults(form: HTMLFormElement) {
    setFormField(form, "incubationDays", "17");
    setFormField(form, "hatchDay", "17");
    setFormField(form, "candleDay", "7");
    setFormField(form, "lockdownDay", "15");
    setFormField(form, "incubationTempF", "100");
    setFormField(form, "incubationHumidity", "55");
    setFormField(form, "lockdownTempF", "100");
    setFormField(form, "lockdownHumidity", "65");
  }

  async function previewJsonImport(file: File) {
    setImportPreview(null);
    setImportData(null);

    const parsed = JSON.parse(await file.text()) as unknown;
    setImportData(parsed);
    const localPreview = importPreviewFromJson(file.name, parsed);
    setImportPreview(localPreview);
    setPreviewingImport(true);
    const result = await apiRequest<{ preview: ImportPreview }>("/data/import/preview", {
      method: "POST",
      body: JSON.stringify({ data: parsed, options: currentRestoreOptions() })
    });
    setImportPreview({ ...result.preview, fileName: file.name });
  }

  async function previewBundleImport(file: File) {
    setBundlePreview(null);
    setBundleDataUrl("");

    const dataUrl = await readFileDataUrl(file);
    setBundleDataUrl(dataUrl);
    setPreviewingImport(true);
    const result = await apiRequest<BundlePreviewResult>("/data/import/bundle/preview", {
      method: "POST",
      body: JSON.stringify({ fileName: file.name, dataUrl, options: currentRestoreOptions() })
    });
    setBundlePreview({ ...result, preview: { ...result.preview, fileName: file.name } });
  }

  async function handleImportPreview(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setImportPreview(null);
    setImportData(null);
    setBundlePreview(null);
    setBundleDataUrl("");
    setImportPreviewError("");
    if (!file) return;

    try {
      const isBundle = file.name.toLowerCase().endsWith(".zip") || file.type.includes("zip");
      if (isBundle) {
        await previewBundleImport(file);
      } else {
        await previewJsonImport(file);
      }
    } catch (error) {
      setImportPreviewError(error instanceof Error ? error.message : "That backup file could not be read.");
    } finally {
      setPreviewingImport(false);
      event.target.value = "";
    }
  }

  async function handleImportSelectedBackup() {
    const options = currentRestoreOptions();
    if (bundlePreview && bundleDataUrl) {
      await onImportBundle(bundleDataUrl, options);
      setBundleDataUrl("");
      setBundlePreview(null);
    } else if (importData) {
      await onImportData(importData, options);
      setImportData(null);
      setImportPreview(null);
    }
    setImportPreviewError("");
  }

  function currentRestoreOptions(): RestoreOptions {
    return {
      scope: restoreScope,
      conflictMode,
      confirmReplace: replaceConfirmation.trim()
    };
  }

  return (
    <section className="panel">
      <p className="eyebrow">Settings</p>
      <h2>Homestead configuration</h2>
      <p className="muted">
        These mirror the prototype defaults. Owners can update homestead settings; individual records can still override copied defaults later.
      </p>
      <form onSubmit={onSettings}>
        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          {[
            ["homestead", "Homestead"],
            ["flock", "Flock planning"],
            ["tracking", "Tracking"],
            ["value", "Value model"],
            ["incubation", "Incubation"],
            ["data", "Data"],
            ["users", "Users"]
          ].map(([id, label]) => (
            <button
              className={`settings-tab ${tab === id ? "active" : ""}`}
              key={id}
              type="button"
              onClick={() => setTab(id as SettingsTab)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`settings-grid settings-panel ${tab === "homestead" ? "active" : ""}`}>
          <article className="settings-card">
            <p className="eyebrow">Profile</p>
            <h3>Covey</h3>
            <HomesteadSettingsFields homestead={homestead} includeIncubation={false} />
            <label>
              Profile note
              <input
                name="homesteadSubtitle"
                defaultValue={displayPreference(homestead, "homesteadSubtitle", "Local records")}
                placeholder="Local records"
              />
            </label>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Preferences</p>
            <h3>Display defaults</h3>
            <label>
              Default bird view
              <select name="defaultBirdView" defaultValue={displayPreference(homestead, "defaultBirdView", "active")}>
                <option value="active">Active flock</option>
                <option value="all">All records</option>
                <option value="inactive">Inactive records</option>
              </select>
            </label>
            <label>
              Weight unit
              <select name="weightUnit" defaultValue={displayPreference(homestead, "weightUnit", "oz")}>
                <option value="oz">Ounces</option>
                <option value="g">Grams</option>
              </select>
            </label>
            <label>
              UI mode
              <select name="uiMode" defaultValue={displayPreference(homestead, "uiMode", "auto")}>
                <option value="auto">Auto</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Currency code
              <input name="currencyCode" maxLength={3} defaultValue={displayPreference(homestead, "currencyCode", "USD")} />
            </label>
            <label>
              Time zone
              <input name="timeZone" defaultValue={displayPreference(homestead, "timeZone", "America/Los_Angeles")} />
            </label>
            <label>
              Time display
              <select name="timeFormat" defaultValue={displayPreference(homestead, "timeFormat", "12h")}>
                <option value="12h">12-hour</option>
                <option value="24h">24-hour</option>
              </select>
            </label>
            <label>
              Date display
              <select name="dateFormat" defaultValue={displayPreference(homestead, "dateFormat", "medium")}>
                <option value="medium">Jun 6, 2026</option>
                <option value="short">6/6/26</option>
                <option value="iso">2026-06-06</option>
              </select>
            </label>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Security</p>
            <h3>Password policy</h3>
            <label>
              Minimum password length
              <input name="passwordMinLength" type="number" min="8" max="128" defaultValue={displayPreference(homestead, "passwordMinLength", 12)} />
            </label>
            <label>
              Require MFA for keepers
              <select name="requireMfaForKeepers" defaultValue={displayPreference(homestead, "requireMfaForKeepers", "no")}>
                <option value="no">No</option>
                <option value="yes">Yes, recommended later</option>
              </select>
            </label>
            <label>
              Standard session duration, hours
              <input
                name="sessionDurationHours"
                type="number"
                min="1"
                max="720"
                defaultValue={displayPreference(homestead, "sessionDurationHours", 24)}
              />
            </label>
            <label>
              Remember me duration, days
              <input
                name="rememberMeDurationDays"
                type="number"
                min="1"
                max="365"
                defaultValue={displayPreference(homestead, "rememberMeDurationDays", 30)}
              />
            </label>
          </article>
        </div>

        <div className={`settings-grid settings-panel ${tab === "flock" ? "active" : ""}`}>
          <article className="settings-card">
            <p className="eyebrow">Breeding balance</p>
            <h3>Flock ratios</h3>
            <label>
              Target hens per rooster
              <input
                name="hensPerRooster"
                type="number"
                min="1"
                max="12"
                defaultValue={displayPreference(homestead, "hensPerRooster", 4)}
              />
            </label>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Meat evaluation</p>
            <h3>Processing targets</h3>
            <label>
              Minimum processing age, weeks
              <input
                name="minProcessAgeWeeks"
                type="number"
                min="1"
                defaultValue={displayPreference(homestead, "minProcessAgeWeeks", 8)}
              />
            </label>
            <label>
              Target live weight, oz
              <input
                name="targetLiveWeightOz"
                type="number"
                min="1"
                step="0.1"
                defaultValue={displayPreference(homestead, "targetLiveWeightOz", 8)}
              />
            </label>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Breeder evaluation</p>
            <h3>Selection rules</h3>
            <label>
              Prefer calm temperament
              <select name="preferCalm" defaultValue={displayPreference(homestead, "preferCalm", "yes")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label>
              Minimum breeder observation
              <select name="minBreederRating" defaultValue={displayPreference(homestead, "minBreederRating", 3)}>
                <option value="4">Strong or excellent</option>
                <option value="3">Promising or better</option>
                <option value="2">Any positive observation</option>
              </select>
            </label>
          </article>
        </div>

        <div className={`settings-grid settings-panel ${tab === "tracking" ? "active" : ""}`}>
          <article className="settings-card">
            <p className="eyebrow">Growth tracking</p>
            <h3>Weigh-in checkpoints</h3>
            <label>
              Reminder ages in weeks
              <input name="weighWeeks" defaultValue={displayPreference(homestead, "weighWeeks", "1, 2, 4, 6, 8")} />
            </label>
          </article>
          <article className="settings-card">
            <p className="eyebrow">New hatch defaults</p>
            <h3>Placeholder chicks</h3>
            <label>
              Default brooder coop
              <select
                name="defaultBrooderCoop"
                defaultValue={displayPreference(homestead, "defaultBrooderCoop", "")}
              >
                <option value="">No default</option>
                {coops.map((coop) => (
                  <option key={coop.id} value={coop.name}>
                    {coop.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Create chick records after hatch
              <select
                name="autoCreateChickRecords"
                defaultValue={displayPreference(homestead, "autoCreateChickRecords", "yes")}
              >
                <option value="yes">Yes, checked by default</option>
                <option value="no">No, leave unchecked</option>
              </select>
            </label>
          </article>
        </div>

        <div className={`settings-grid settings-panel ${tab === "value" ? "active" : ""}`}>
          <article className="settings-card">
            <p className="eyebrow">Production value</p>
            <h3>Eggs and chicks</h3>
            <label>
              Table egg value ($)
              <input name="valueTableEgg" type="number" min="0" step="0.01" defaultValue={displayPreference(homestead, "valueTableEgg", 0.35)} />
            </label>
            <label>
              Fertile egg value ($)
              <input name="valueFertileEgg" type="number" min="0" step="0.01" defaultValue={displayPreference(homestead, "valueFertileEgg", 1)} />
            </label>
            <label>
              Chick / offspring value ($)
              <input name="valueChick" type="number" min="0" step="0.01" defaultValue={displayPreference(homestead, "valueChick", 3)} />
            </label>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Meat value</p>
            <h3>Processed birds</h3>
            <label>
              Dressed meat value ($/oz)
              <input name="valueMeatPerOz" type="number" min="0" step="0.01" defaultValue={displayPreference(homestead, "valueMeatPerOz", 0.5)} />
            </label>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Rating thresholds</p>
            <h3>Value colors</h3>
            <label>
              Strong return starts at ($)
              <input name="roiStrongReturn" type="number" step="0.01" defaultValue={displayPreference(homestead, "roiStrongReturn", 10)} />
            </label>
            <label>
              Positive return starts at ($)
              <input name="roiPositiveReturn" type="number" step="0.01" defaultValue={displayPreference(homestead, "roiPositiveReturn", 0)} />
            </label>
          </article>
        </div>

        <div className={`settings-grid settings-panel ${tab === "incubation" ? "active" : ""}`}>
          <article className="settings-card">
            <p className="eyebrow">Protocol defaults</p>
            <h3>Cycle timing</h3>
            <label>
              Total cycle days
              <input name="incubationDays" type="number" min="1" max="40" defaultValue={displayPreference(homestead, "incubationDays", 17)} />
            </label>
            <label>
              Expected hatch day
              <input name="hatchDay" type="number" min="1" max="40" defaultValue={displayPreference(homestead, "hatchDay", 17)} />
            </label>
            <label>
              Candle on day
              <input name="candleDay" type="number" min="1" max="30" defaultValue={displayPreference(homestead, "candleDay", 7)} />
            </label>
            <label>
              Begin lockdown on day
              <input name="lockdownDay" type="number" min="1" max="35" defaultValue={displayPreference(homestead, "lockdownDay", 15)} />
            </label>
            <button
              className="text-button"
              type="button"
              onClick={(event) => {
                if (event.currentTarget.form) applyCoturnixIncubationDefaults(event.currentTarget.form);
              }}
            >
              Use Coturnix defaults
            </button>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Environment</p>
            <h3>Temperature and humidity</h3>
            <label>
              Days 1 to lockdown temperature (F)
              <input name="incubationTempF" type="number" min="80" max="110" step="0.1" defaultValue={displayPreference(homestead, "incubationTempF", 100)} />
            </label>
            <label>
              Days 1 to lockdown humidity (%)
              <input name="incubationHumidity" type="number" min="0" max="100" defaultValue={displayPreference(homestead, "incubationHumidity", 55)} />
            </label>
            <label>
              Lockdown temperature (F)
              <input name="lockdownTempF" type="number" min="80" max="110" step="0.1" defaultValue={displayPreference(homestead, "lockdownTempF", 100)} />
            </label>
            <label>
              Lockdown humidity (%)
              <input name="lockdownHumidity" type="number" min="0" max="100" defaultValue={displayPreference(homestead, "lockdownHumidity", 65)} />
            </label>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Reminders and location</p>
            <h3>Cycle setup</h3>
            <label>
              Default incubator / tray
              <input name="defaultIncubatorLocation" defaultValue={displayPreference(homestead, "defaultIncubatorLocation", "")} />
            </label>
            <label>
              Candle reminder lead days
              <input name="candleReminderLeadDays" type="number" min="0" max="7" defaultValue={displayPreference(homestead, "candleReminderLeadDays", 1)} />
            </label>
            <label>
              Lockdown reminder lead days
              <input name="lockdownReminderLeadDays" type="number" min="0" max="7" defaultValue={displayPreference(homestead, "lockdownReminderLeadDays", 1)} />
            </label>
          </article>
        </div>

        <div className={`settings-grid settings-panel ${tab === "data" ? "active" : ""}`}>
          <article className="settings-card data-export-card">
            <p className="eyebrow">Export</p>
            <h3>Download backup</h3>
            <p className="muted">
              Choose records only, or include uploaded photos in a backup bundle. Passwords, sessions,
              MFA secrets, reset tokens, raw camera URLs, audit history, and database dumps are left out.
            </p>
            <label>
              What to export
              <select value={backupExportMode} onChange={(event) => setBackupExportMode(event.currentTarget.value as "records" | "all")}>
                <option value="records">Records only</option>
                <option value="all">Records and uploaded photos</option>
              </select>
            </label>
            <button
              disabled={busy}
              type="button"
              onClick={() => onExportData(backupExportMode === "all" ? "bundle" : "json", backupExportMode === "all")}
            >
              {busy ? "Preparing..." : "Download backup"}
            </button>
          </article>
          <article className="settings-card backup-card">
            <p className="eyebrow">Backup scheduler</p>
            <h3>Automatic sanitized backups</h3>
            <p className="muted">
              Scheduled backups are records-only JSON and are stored in the API backup volume. Use the
              manual backup bundle when you want to include uploaded photos.
            </p>
            <div className="backup-status-grid">
              <span>
                <strong>{backupEnabled ? "Enabled" : "Off"}</strong>
                Schedule
              </span>
              <span>
                <strong>{backupStatus?.lastSuccess ? formatDateTime(backupStatus.lastSuccess.completed_at) : "Never"}</strong>
                Last backup
              </span>
              <span>
                <strong>{backupStatus?.nextDueAt ? formatDateTime(backupStatus.nextDueAt) : "Not scheduled"}</strong>
                Next due
              </span>
            </div>
            <label className="check-row">
              <input
                checked={backupEnabled}
                type="checkbox"
                onChange={(event) => setBackupEnabled(event.currentTarget.checked)}
              />
              Enable automatic backups
            </label>
            <label>
              Frequency
              <select value={backupFrequency} onChange={(event) => setBackupFrequency(event.currentTarget.value as BackupSettings["frequency"])}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            {backupFrequency === "weekly" ? (
              <label>
                Day of week
                <select value={backupDayOfWeek} onChange={(event) => setBackupDayOfWeek(Number(event.currentTarget.value))}>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => (
                    <option key={day} value={index}>{day}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {backupFrequency === "monthly" ? (
              <label>
                Day of month
                <input
                  max="28"
                  min="1"
                  type="number"
                  value={backupDayOfMonth}
                  onChange={(event) => setBackupDayOfMonth(Number(event.currentTarget.value))}
                />
              </label>
            ) : null}
            <label>
              Time of day, UTC
              <input
                type="time"
                value={backupTimeOfDay}
                onChange={(event) => setBackupTimeOfDay(event.currentTarget.value)}
              />
            </label>
            <label>
              Backups to keep
              <input
                max="100"
                min="1"
                type="number"
                value={backupRetentionCount}
                onChange={(event) => setBackupRetentionCount(Number(event.currentTarget.value))}
              />
            </label>
            <div className="row-actions">
              <button disabled={backupBusy || user.role !== "OWNER"} type="button" onClick={handleSaveBackupSettings}>
                {backupBusy ? "Saving..." : "Save schedule"}
              </button>
              <button className="secondary" disabled={backupBusy || user.role !== "OWNER"} type="button" onClick={handleRunBackupNow}>
                Run backup now
              </button>
            </div>
            {backupError ? <p className="form-error">{backupError}</p> : null}
            <div className="backup-history">
              <strong>Recent backups</strong>
              {backupStatus?.history.length ? (
                backupStatus.history.map((backup) => (
                  <article className={`backup-history-row ${backup.status.toLowerCase()}`} key={backup.id}>
                    <div>
                      <b>{backup.status === "SUCCESS" ? "Success" : "Failed"}</b>
                      <span>
                        {formatDateTime(backup.completed_at)} · {backup.trigger_type.toLowerCase()} · {formatBytes(backup.byte_size)}
                      </span>
                      {backup.error_message ? <small>{backup.error_message}</small> : null}
                    </div>
                    {backup.status === "SUCCESS" ? (
                      <button className="secondary" disabled={backupBusy} type="button" onClick={() => handleDownloadBackup(backup)}>
                        Download
                      </button>
                    ) : null}
                  </article>
                ))
              ) : (
                <p className="muted">No backups have run yet.</p>
              )}
            </div>
          </article>
          <article className="settings-card">
            <p className="eyebrow">Import preview</p>
            <h3>Inspect and import backup</h3>
            <p className="muted">
              Select a Covey backup bundle or compatible JSON export. Covey detects what is included
              and previews record counts, validation issues, and conflicts before writing anything.
            </p>
            <label>
              Restore scope
              <select
                value={restoreScope}
                onChange={(event) => {
                  setRestoreScope(event.currentTarget.value as RestoreScope);
                  setImportPreview(null);
                  setBundlePreview(null);
                }}
              >
                <option value="all">All records</option>
                <option value="settings">Settings only</option>
                <option value="coops">Coops</option>
                <option value="birds">Birds and weights</option>
                <option value="breeding">Breeding lines and mating periods</option>
                <option value="incubation">Incubation and hatch batches</option>
                <option value="eggs">Egg logs</option>
                <option value="feed">Feed catalog, inventory, and top-offs</option>
                <option value="sales">Sales</option>
                <option value="health">Health records</option>
                <option value="photos">Photos only</option>
              </select>
            </label>
            <label>
              Existing records
              <select
                value={conflictMode}
                onChange={(event) => {
                  setConflictMode(event.currentTarget.value as ConflictMode);
                  setImportPreview(null);
                  setBundlePreview(null);
                }}
              >
                <option value="skip">Skip existing records</option>
                <option value="replace">Replace selected scope</option>
              </select>
            </label>
            {conflictMode === "replace" ? (
              <>
                <label>
                  Type REPLACE {restoreScope.toUpperCase()}
                  <input
                    value={replaceConfirmation}
                    onChange={(event) => setReplaceConfirmation(event.currentTarget.value)}
                    placeholder={`REPLACE ${restoreScope.toUpperCase()}`}
                  />
                </label>
                <p className="muted">
                  Replace removes current records in the selected scope before restoring this file. Covey creates a pre-restore records backup first.
                </p>
              </>
            ) : null}
            <label>
              Backup file
              <input accept="application/zip,application/json,.zip,.json" type="file" onChange={handleImportPreview} />
            </label>
            {bundlePreview ? (
              <>
                <ImportPreviewPanel preview={bundlePreview.preview} />
                <p className="muted">
                  Bundle contains {bundlePreview.bundle.photos} photo record{bundlePreview.bundle.photos === 1 ? "" : "s"} and{" "}
                  {bundlePreview.bundle.files} file entr{bundlePreview.bundle.files === 1 ? "y" : "ies"}.
                </p>
                <div className="import-actions">
                  <button
                    className="secondary"
                    disabled={
                      busy ||
                      previewingImport ||
                      bundlePreview.preview.canImport !== true ||
                      !bundleDataUrl ||
                      (conflictMode === "replace" && replaceConfirmation.trim() !== `REPLACE ${restoreScope.toUpperCase()}`)
                    }
                    type="button"
                    onClick={handleImportSelectedBackup}
                  >
                    {busy ? "Importing..." : bundlePreview.preview.canImport === true ? "Import backup" : "Fix validation errors first"}
                  </button>
                  <p className="muted">
                    Bundle import creates records and reattaches included photos. It does not replace the whole database.
                  </p>
                </div>
              </>
            ) : null}
            {importPreviewError ? <p className="form-error">{importPreviewError}</p> : null}
            {importPreview ? <ImportPreviewPanel preview={importPreview} /> : null}
            {previewingImport ? <p className="muted">Checking this file against the current homestead...</p> : null}
            {importPreview ? (
              <div className="import-actions">
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    previewingImport ||
                    importPreview.canImport !== true ||
                    !importData ||
                    (conflictMode === "replace" && replaceConfirmation.trim() !== `REPLACE ${restoreScope.toUpperCase()}`)
                  }
                  type="button"
                  onClick={handleImportSelectedBackup}
                >
                  {busy ? "Importing..." : importPreview.canImport === true ? "Import backup" : "Fix validation errors first"}
                </button>
                <p className="muted">
                  Import creates new flock records and skips accounts, sessions, MFA secrets, and raw camera URLs.
                </p>
              </div>
            ) : null}
          </article>
        </div>

        {tab !== "users" && tab !== "data" ? (
          <div className="settings-actions">
            <button disabled={busy || user.role !== "OWNER"} type="submit">
              {user.role !== "OWNER" ? "Owner access required" : busy ? "Saving..." : "Save settings"}
            </button>
          </div>
        ) : null}
      </form>

      {tab === "users" ? (
        <UserSettingsPanel
          busy={busy}
          currentUser={user}
          users={managedUsers}
          onCreateManagedUser={onCreateManagedUser}
          onDisableManagedUser={onDisableManagedUser}
          onDisableMfa={onDisableMfa}
          onEnableMfa={onEnableMfa}
          onStartMfaSetup={onStartMfaSetup}
          onUpdateManagedUser={onUpdateManagedUser}
        />
      ) : null}
    </section>
  );
}

function ImportPreviewPanel({ preview }: { preview: ImportPreview }) {
  const counts = preview.scopedRecordCounts ?? preview.recordCounts;
  return (
    <div className="import-preview">
      <div className="import-preview-summary">
        <span>
          <strong>{preview.totals.records}</strong>
          records
        </span>
        <span>
          <strong>{preview.totals.errors}</strong>
          errors
        </span>
        <span>
          <strong>{preview.totals.warnings}</strong>
          warnings
        </span>
      </div>
      <p className="muted">
        {preview.fileName} · {preview.format}
        {preview.restore ? ` · ${preview.restore.scope} · ${preview.restore.conflictMode}` : ""}
      </p>
      <div className="import-count-grid">
        {counts.map((item) => (
          <span key={item.label}>
            <strong>{item.count}</strong>
            {item.label}
          </span>
        ))}
      </div>
      {preview.issues.length ? (
        <div className="import-issues">
          {preview.issues.slice(0, 12).map((issue) => (
            <p className={`import-issue ${issue.severity}`} key={`${issue.severity}-${issue.message}`}>
              <strong>{issue.severity}</strong>
              {issue.message}
            </p>
          ))}
          {preview.issues.length > 12 ? (
            <p className="muted">Showing first 12 of {preview.issues.length} issues.</p>
          ) : null}
        </div>
      ) : (
        <p className="success-copy">No preview issues found. This file is a good candidate for the import step.</p>
      )}
      {preview.canImport === false ? (
        <p className="form-error">Server validation says this file is not ready to import yet.</p>
      ) : preview.canImport ? (
        <p className="success-copy">Server validation passed. This file can be imported.</p>
      ) : null}
    </div>
  );
}

function UserSettingsPanel({
  busy,
  currentUser,
  users,
  onCreateManagedUser,
  onDisableManagedUser,
  onDisableMfa,
  onEnableMfa,
  onStartMfaSetup,
  onUpdateManagedUser
}: {
  busy: boolean;
  currentUser: User;
  users: ManagedUser[];
  onCreateManagedUser: (event: FormEvent<HTMLFormElement>) => void;
  onDisableManagedUser: (id: string) => void;
  onDisableMfa: (event: FormEvent<HTMLFormElement>) => void;
  onEnableMfa: (event: FormEvent<HTMLFormElement>) => void;
  onStartMfaSetup: () => Promise<MfaSetup | null>;
  onUpdateManagedUser: (id: string, form: HTMLFormElement) => void;
}) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const activeUsers = users.filter((managedUser) => !managedUser.disabled_at);

  if (currentUser.role !== "OWNER") {
    return (
      <div className="settings-grid settings-panel active user-settings-panel">
        <MfaSecurityCard
          busy={busy}
          currentUser={currentUser}
          mfaSetup={mfaSetup}
          onDisableMfa={onDisableMfa}
          onEnableMfa={onEnableMfa}
          onMfaSetup={setMfaSetup}
          onStartMfaSetup={onStartMfaSetup}
        />
        <article className="settings-card">
          <p className="eyebrow">Users</p>
          <h3>Owner access required</h3>
          <p className="muted">Keepers can manage flock records, but only owners can invite users or change roles.</p>
        </article>
      </div>
    );
  }

  return (
    <div className="settings-grid settings-panel active user-settings-panel">
      <article className="settings-card role-card">
        <p className="eyebrow">Roles</p>
        <h3>Access levels</h3>
        <div className="role-list">
          <div>
            <strong>Owner</strong>
            <span>Manage users, settings, and all records.</span>
          </div>
          <div>
            <strong>Keeper</strong>
            <span>Manage birds, coops, feed, eggs, breeding, and incubation records.</span>
          </div>
          <div>
            <strong>Viewer</strong>
            <span>Read-only access for checking dashboards and history.</span>
          </div>
        </div>
      </article>

      <MfaSecurityCard
        busy={busy}
        currentUser={currentUser}
        mfaSetup={mfaSetup}
        onDisableMfa={onDisableMfa}
        onEnableMfa={onEnableMfa}
        onMfaSetup={setMfaSetup}
        onStartMfaSetup={onStartMfaSetup}
      />

      <article className="settings-card invite-card">
        <p className="eyebrow">Invite</p>
        <h3>Create user account</h3>
        <form className="feed-form" onSubmit={onCreateManagedUser}>
          <label>
            Display name
            <input name="displayName" required placeholder="Taylor" />
          </label>
          <label>
            Email
            <input name="email" required type="email" placeholder="keeper@example.com" />
          </label>
          <label>
            Role
            <select name="role" defaultValue="KEEPER">
              <option value="KEEPER">Keeper</option>
              <option value="VIEWER">Viewer</option>
              <option value="OWNER">Owner</option>
            </select>
          </label>
          <label>
            Temporary password
            <input name="password" required minLength={12} type="password" placeholder="At least 12 characters" />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Creating..." : "Create user"}
          </button>
        </form>
      </article>

      <article className="settings-card user-list-card">
        <p className="eyebrow">Accounts</p>
        <h3>{activeUsers.length} active users</h3>
        <div className="user-list">
          {users.map((managedUser) => {
            const isEditing = editingUserId === managedUser.id;
            const disabled = Boolean(managedUser.disabled_at);
            return (
              <div className={`user-row ${disabled ? "disabled" : ""}`} key={managedUser.id}>
                {isEditing ? (
                  <form
                    className="user-edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      onUpdateManagedUser(managedUser.id, event.currentTarget);
                      setEditingUserId(null);
                    }}
                  >
                    <label>
                      Display name
                      <input name="displayName" required defaultValue={managedUser.display_name} />
                    </label>
                    <label>
                      Role
                      <select name="role" defaultValue={managedUser.role}>
                        <option value="OWNER">Owner</option>
                        <option value="KEEPER">Keeper</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    </label>
                    <label>
                      Status
                      <select name="disabled" defaultValue={disabled ? "yes" : "no"}>
                        <option value="no">Active</option>
                        <option value="yes">Disabled</option>
                      </select>
                    </label>
                    <label>
                      New temporary password
                      <input name="password" minLength={12} type="password" placeholder="Leave blank to keep current" />
                    </label>
                    <div className="user-actions">
                      <button disabled={busy} type="submit">
                        Save user
                      </button>
                      <button className="secondary" type="button" onClick={() => setEditingUserId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div>
                      <strong>{managedUser.display_name}</strong>
                      <span>{managedUser.email}</span>
                    </div>
                    <span className={`status-chip ${disabled ? "retired" : "active"}`}>
                      {disabled ? "Disabled" : "Active"}
                    </span>
                    <span className="role-pill">{managedUser.role.toLowerCase()}</span>
                    <div className="user-actions">
                      <button className="secondary" type="button" onClick={() => setEditingUserId(managedUser.id)}>
                        Edit
                      </button>
                      <button
                        className="danger"
                        disabled={busy || managedUser.id === currentUser.id || disabled}
                        type="button"
                        onClick={() => onDisableManagedUser(managedUser.id)}
                      >
                        Disable
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}

function MfaSecurityCard({
  busy,
  currentUser,
  mfaSetup,
  onDisableMfa,
  onEnableMfa,
  onMfaSetup,
  onStartMfaSetup
}: {
  busy: boolean;
  currentUser: User;
  mfaSetup: MfaSetup | null;
  onDisableMfa: (event: FormEvent<HTMLFormElement>) => void;
  onEnableMfa: (event: FormEvent<HTMLFormElement>) => void;
  onMfaSetup: (setup: MfaSetup | null) => void;
  onStartMfaSetup: () => Promise<MfaSetup | null>;
}) {
  return (
    <article className="settings-card security-card">
      <p className="eyebrow">Security</p>
      <h3>Your account</h3>
      <p className="muted">
        MFA is {currentUser.mfa_enabled ? "enabled" : "off"} for {currentUser.email}.
      </p>
      {currentUser.mfa_enabled ? (
        <form className="feed-form" onSubmit={onDisableMfa}>
          <label>
            Authenticator code
            <input name="code" required inputMode="numeric" pattern="[0-9]{6}" placeholder="123456" />
          </label>
          <button className="danger" disabled={busy} type="submit">
            Disable MFA
          </button>
        </form>
      ) : (
        <div className="mfa-setup">
          <button
            className="secondary"
            disabled={busy}
            type="button"
            onClick={async () => {
              const setup = await onStartMfaSetup();
              if (setup) onMfaSetup(setup);
            }}
          >
            Start MFA setup
          </button>
          {mfaSetup ? (
            <>
              <div className="mfa-qr-card">
                <img
                  alt="Authenticator setup QR code"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(mfaSetup.otpauthUrl)}`}
                />
                <span>Scan this QR code with your authenticator app.</span>
              </div>
              <div className="mfa-secret">
                <span>Manual secret</span>
                <strong>{mfaSetup.secret}</strong>
              </div>
              <p className="muted">
                Add this secret to an authenticator app, then enter the current 6-digit code.
              </p>
              <form className="feed-form" onSubmit={onEnableMfa}>
                <label>
                  Authenticator code
                  <input name="code" required inputMode="numeric" pattern="[0-9]{6}" placeholder="123456" />
                </label>
                <button disabled={busy} type="submit">
                  Verify and enable
                </button>
              </form>
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}

function FeedManager({
  birds,
  busy,
  coops,
  homestead,
  feedInventoryEvents,
  feedLogs,
  feedTypes,
  photoAttachments,
  onCreateFeedInventoryEvent,
  onCreateFeedLog,
  onCreateFeedType,
  onBulkDeleteFeedInventoryEvents,
  onBulkDeleteFeedLogs,
  onBulkDeleteFeedTypes,
  onBulkUpdateFeedInventoryEvents,
  onBulkUpdateFeedLogs,
  onBulkUpdateFeedTypes,
  onDeleteFeedInventoryEvent,
  onDeleteFeedLog,
  onDeleteFeedType,
  onDeletePhoto,
  onCreatePhoto,
  onUpdateFeedInventoryEvent,
  onUpdateFeedLog,
  onUpdateFeedType
}: {
  birds: Bird[];
  busy: boolean;
  coops: Coop[];
  homestead: Homestead;
  feedInventoryEvents: FeedInventoryEvent[];
  feedLogs: FeedLog[];
  feedTypes: FeedType[];
  photoAttachments: PhotoAttachment[];
  onCreateFeedInventoryEvent: (event: FormEvent<HTMLFormElement>) => void;
  onCreateFeedLog: (event: FormEvent<HTMLFormElement>) => void;
  onCreateFeedType: (event: FormEvent<HTMLFormElement>) => void;
  onBulkDeleteFeedInventoryEvents: (ids: string[]) => Promise<void>;
  onBulkDeleteFeedLogs: (ids: string[]) => Promise<void>;
  onBulkDeleteFeedTypes: (ids: string[]) => Promise<void>;
  onBulkUpdateFeedInventoryEvents: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateFeedLogs: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onBulkUpdateFeedTypes: (ids: string[], patch: Record<string, unknown>) => Promise<void>;
  onDeleteFeedInventoryEvent: (id: string) => void;
  onDeleteFeedLog: (id: string) => void;
  onDeleteFeedType: (id: string) => void;
  onDeletePhoto: (id: string) => void;
  onCreatePhoto: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateFeedInventoryEvent: (id: string, form: HTMLFormElement) => void;
  onUpdateFeedLog: (id: string, form: HTMLFormElement) => void;
  onUpdateFeedType: (id: string, form: HTMLFormElement) => void;
}) {
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingRestockId, setEditingRestockId] = useState<string | null>(null);
  const [selectedFeedTypeIds, setSelectedFeedTypeIds] = useState<string[]>([]);
  const [selectedRestockIds, setSelectedRestockIds] = useState<string[]>([]);
  const [selectedTopOffIds, setSelectedTopOffIds] = useState<string[]>([]);
  const [bulkFeedEditing, setBulkFeedEditing] = useState(false);
  const [bulkRestockEditing, setBulkRestockEditing] = useState(false);
  const [bulkTopOffEditing, setBulkTopOffEditing] = useState(false);
  const [bulkFeedActive, setBulkFeedActive] = useState("NO_CHANGE");
  const [bulkFeedProtein, setBulkFeedProtein] = useState("");
  const [bulkRestockFeedId, setBulkRestockFeedId] = useState("NO_CHANGE");
  const [bulkRestockUnit, setBulkRestockUnit] = useState("NO_CHANGE");
  const [bulkRestockNotes, setBulkRestockNotes] = useState("");
  const [bulkTopOffCoopId, setBulkTopOffCoopId] = useState("NO_CHANGE");
  const [bulkTopOffFeedId, setBulkTopOffFeedId] = useState("NO_CHANGE");
  const [bulkTopOffUnit, setBulkTopOffUnit] = useState("NO_CHANGE");
  const [bulkTopOffNotes, setBulkTopOffNotes] = useState("");
  const [feedAction, setFeedAction] = useState<"topoff" | "restock" | "feed">("topoff");
  const [selectedFeedId, setSelectedFeedId] = useState<string | null>(null);
  const [feedSort, setFeedSort] = useState<{ key: FeedSortKey; dir: SortDirection }>({ key: "name", dir: "asc" });
  const [restockSort, setRestockSort] = useState<{ key: RestockSortKey; dir: SortDirection }>({ key: "date", dir: "desc" });
  const [topOffSort, setTopOffSort] = useState<{ key: FeedLogSortKey; dir: SortDirection }>({ key: "date", dir: "desc" });
  const preferredTopOffUnit = normalizeFeedTopOffUnit(
    homestead.preferences.feedTopOffUnit ?? homestead.preferences.feedTopoffUnit
  );
  const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyCost = feedLogs
    .filter((log) => new Date(log.logged_at).getTime() >= weekStart)
    .reduce((sum, log) => sum + numberValue(log.cost), 0);
  const totalCost = feedLogs.reduce((sum, log) => sum + numberValue(log.cost), 0);
  const activeBirdCount = birds.filter((bird) => bird.status === "ACTIVE").length;
  const averageActiveBirdCost = activeBirdCount ? totalCost / activeBirdCount : 0;
  const inventoryCups = feedTypes.reduce((sum, feed) => sum + numberValue(feed.inventory_cups), 0);
  const inventoryValue = feedTypes.reduce((sum, feed) => sum + feedInventoryValue(feed), 0);
  const coopFeedSummaries = Object.values(
    feedLogs.reduce<Record<string, { coop: string; cost: number; amountLb: number; logs: number; activeBirds: number }>>(
      (summary, log) => {
        const current = summary[log.coop_id] ?? {
          coop: log.coop_name,
          cost: 0,
          amountLb: 0,
          logs: 0,
          activeBirds: numberValue(log.active_bird_count)
        };
        current.cost += numberValue(log.cost);
        current.amountLb += numberValue(log.amount_lb);
        current.logs += 1;
        current.activeBirds = Math.max(current.activeBirds, numberValue(log.active_bird_count));
        summary[log.coop_id] = current;
        return summary;
      },
      {}
    )
  ).sort((a, b) => b.cost - a.cost);
  const selectedFeed = feedTypes.find((feed) => feed.id === selectedFeedId) ?? null;
  const sortedFeedTypes = [...feedTypes].sort((a, b) => {
    const value = (feed: FeedType) => {
      if (feedSort.key === "name") return feedTypeLabel(feed);
      if (feedSort.key === "protein") return numberValue(feed.protein_percent);
      if (feedSort.key === "bagCost") return numberValue(feed.bag_cost);
      if (feedSort.key === "cups") return cupsPerBag(feed);
      if (feedSort.key === "cupCost") return costPerCup(feed);
      if (feedSort.key === "inventory") return numberValue(feed.inventory_cups);
      return feed.active ? 1 : 0;
    };
    return compareValues(value(a), value(b)) * (feedSort.dir === "asc" ? 1 : -1);
  });
  const sortedRestocks = [...feedInventoryEvents].sort((a, b) => {
    const value = (event: FeedInventoryEvent) => {
      if (restockSort.key === "date") return event.logged_at;
      if (restockSort.key === "feed") return `${event.feed_brand} ${event.feed_name}`;
      if (restockSort.key === "amount") return numberValue(event.amount);
      if (restockSort.key === "cups") return numberValue(event.amount_cups);
      if (restockSort.key === "cost") return numberValue(event.cost);
      return numberValue(event.cost) / Math.max(1, numberValue(event.amount_cups));
    };
    return compareValues(value(a), value(b)) * (restockSort.dir === "asc" ? 1 : -1);
  });
  const sortedTopOffs = [...feedLogs].sort((a, b) => {
    const value = (log: FeedLog) => {
      if (topOffSort.key === "date") return log.logged_at;
      if (topOffSort.key === "coop") return log.coop_name;
      if (topOffSort.key === "feed") return `${log.feed_brand} ${log.feed_name}`;
      if (topOffSort.key === "amount") return numberValue(log.amount);
      if (topOffSort.key === "cost") return numberValue(log.cost);
      return numberValue(log.active_bird_count)
        ? numberValue(log.cost) / numberValue(log.active_bird_count)
        : 0;
    };
    return compareValues(value(a), value(b)) * (topOffSort.dir === "asc" ? 1 : -1);
  });
  const sortedFeedTypeIds = sortedFeedTypes.map((feed) => feed.id);
  const sortedRestockIds = sortedRestocks.map((event) => event.id);
  const sortedTopOffIds = sortedTopOffs.map((log) => log.id);
  const allFeedTypesSelected =
    sortedFeedTypeIds.length > 0 && sortedFeedTypeIds.every((id) => selectedFeedTypeIds.includes(id));
  const allRestocksSelected =
    sortedRestockIds.length > 0 && sortedRestockIds.every((id) => selectedRestockIds.includes(id));
  const allTopOffsSelected =
    sortedTopOffIds.length > 0 && sortedTopOffIds.every((id) => selectedTopOffIds.includes(id));

  function toggleSelectedId(id: string, setter: Dispatch<SetStateAction<string[]>>, closeEditor: () => void) {
    setter((current) => (current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]));
    closeEditor();
  }

  function toggleAllSelectedIds(
    ids: string[],
    checked: boolean,
    setter: Dispatch<SetStateAction<string[]>>,
    closeEditor: () => void
  ) {
    const idSet = new Set(ids);
    setter((current) => {
      if (!checked) return current.filter((id) => !idSet.has(id));
      return Array.from(new Set([...current, ...ids]));
    });
    closeEditor();
  }

  async function applyBulkFeedEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (bulkFeedActive !== "NO_CHANGE") patch.active = bulkFeedActive === "true";
    if (bulkFeedProtein.trim()) patch.proteinPercent = Number(bulkFeedProtein);
    if (!Object.keys(patch).length) return;
    await onBulkUpdateFeedTypes(selectedFeedTypeIds, patch);
    setSelectedFeedTypeIds([]);
    setBulkFeedEditing(false);
    setBulkFeedActive("NO_CHANGE");
    setBulkFeedProtein("");
  }

  async function applyBulkRestockEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (bulkRestockFeedId !== "NO_CHANGE") patch.feedTypeId = bulkRestockFeedId;
    if (bulkRestockUnit !== "NO_CHANGE") patch.unit = bulkRestockUnit;
    if (bulkRestockNotes.trim()) patch.notes = bulkRestockNotes.trim();
    if (!Object.keys(patch).length) return;
    await onBulkUpdateFeedInventoryEvents(selectedRestockIds, patch);
    setSelectedRestockIds([]);
    setBulkRestockEditing(false);
    setBulkRestockFeedId("NO_CHANGE");
    setBulkRestockUnit("NO_CHANGE");
    setBulkRestockNotes("");
  }

  async function applyBulkTopOffEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch: Record<string, unknown> = {};
    if (bulkTopOffCoopId !== "NO_CHANGE") patch.coopId = bulkTopOffCoopId;
    if (bulkTopOffFeedId !== "NO_CHANGE") patch.feedTypeId = bulkTopOffFeedId;
    if (bulkTopOffUnit !== "NO_CHANGE") patch.unit = bulkTopOffUnit;
    if (bulkTopOffNotes.trim()) patch.notes = bulkTopOffNotes.trim();
    if (!Object.keys(patch).length) return;
    await onBulkUpdateFeedLogs(selectedTopOffIds, patch);
    setSelectedTopOffIds([]);
    setBulkTopOffEditing(false);
    setBulkTopOffCoopId("NO_CHANGE");
    setBulkTopOffFeedId("NO_CHANGE");
    setBulkTopOffUnit("NO_CHANGE");
    setBulkTopOffNotes("");
  }

  async function applyBulkFeedDelete() {
    if (!selectedFeedTypeIds.length) return;
    if (!confirm(`Delete ${selectedFeedTypeIds.length} selected feeds?`)) return;
    await onBulkDeleteFeedTypes(selectedFeedTypeIds);
    setSelectedFeedTypeIds([]);
  }

  async function applyBulkRestockDelete() {
    if (!selectedRestockIds.length) return;
    if (!confirm(`Delete ${selectedRestockIds.length} selected restocks?`)) return;
    await onBulkDeleteFeedInventoryEvents(selectedRestockIds);
    setSelectedRestockIds([]);
  }

  async function applyBulkTopOffDelete() {
    if (!selectedTopOffIds.length) return;
    if (!confirm(`Delete ${selectedTopOffIds.length} selected top-offs?`)) return;
    await onBulkDeleteFeedLogs(selectedTopOffIds);
    setSelectedTopOffIds([]);
  }

  function toggleFeedSort(key: FeedSortKey) {
    setFeedSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
  }

  function toggleRestockSort(key: RestockSortKey) {
    setRestockSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
  }

  function toggleTopOffSort(key: FeedLogSortKey) {
    setTopOffSort((current) => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }));
  }

  function feedSortLabel(key: FeedSortKey, label: string) {
    return `${label}${feedSort.key === key ? (feedSort.dir === "asc" ? " ▲" : " ▼") : ""}`;
  }

  function restockSortLabel(key: RestockSortKey, label: string) {
    return `${label}${restockSort.key === key ? (restockSort.dir === "asc" ? " ▲" : " ▼") : ""}`;
  }

  function topOffSortLabel(key: FeedLogSortKey, label: string) {
    return `${label}${topOffSort.key === key ? (topOffSort.dir === "asc" ? " ▲" : " ▼") : ""}`;
  }

  if (selectedFeed) {
    return (
      <FeedTypeDetail
        busy={busy}
        feed={selectedFeed}
        feedInventoryEvents={feedInventoryEvents}
        feedLogs={feedLogs}
        homestead={homestead}
        photoAttachments={photoAttachments}
        onBack={() => setSelectedFeedId(null)}
        onDeleteFeedType={onDeleteFeedType}
        onDeletePhoto={onDeletePhoto}
        onCreatePhoto={onCreatePhoto}
        onUpdateFeedType={onUpdateFeedType}
      />
    );
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Feed</p>
          <h2>Feed catalog and top-offs</h2>
          <p className="muted">
            Create feeds in pounds and dollars, then log feeder top-offs in cups, pounds, or ounces.
          </p>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Feed cost summary">
        <article className="metric-card">
          <p className="eyebrow">This week</p>
          <strong>{money(weeklyCost)}</strong>
          <span>logged feed cost</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Lifetime logs</p>
          <strong>{money(totalCost)}</strong>
          <span>{feedLogs.length} top-offs</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Feed catalog</p>
          <strong>{feedTypes.length}</strong>
          <span>{feedTypes.filter((feed) => feed.active).length} active</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Feed on hand</p>
          <strong>{inventoryCups.toFixed(1)} cups</strong>
          <span>{money(inventoryValue)} estimated value</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Restocks</p>
          <strong>{feedInventoryEvents.length}</strong>
          <span>purchase/addition records</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Avg / active bird</p>
          <strong>{money(averageActiveBirdCost)}</strong>
          <span>{activeBirdCount} active birds</span>
        </article>
      </section>

      <section className="subpanel">
        <p className="eyebrow">Coops</p>
        <h3>Feed cost by coop</h3>
        {coopFeedSummaries.length ? (
          <div className="source-summary">
            {coopFeedSummaries.map((coop) => (
              <article key={coop.coop}>
                <div>
                  <strong>{coop.coop}</strong>
                  <span>
                    {coop.logs} top-offs · {coop.amountLb.toFixed(2)} lb ·{" "}
                    {coop.activeBirds ? `${money(coop.cost / coop.activeBirds)} / active bird` : "no active birds"}
                  </span>
                </div>
                <b>{money(coop.cost)}</b>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">Log feed top-offs to compare coop-level cost.</p>
        )}
      </section>

      <section className="subpanel">
        <p className="eyebrow">Quick action</p>
        <h3>What are you recording?</h3>
        <div className="action-tabs" role="tablist" aria-label="Feed actions">
          {[
            { id: "topoff", label: "Top off a coop" },
            { id: "restock", label: "Restock feed" },
            { id: "feed", label: "Create feed" }
          ].map((action) => (
            <button
              className={`action-tab ${feedAction === action.id ? "active" : ""}`}
              key={action.id}
              type="button"
              onClick={() => setFeedAction(action.id as "topoff" | "restock" | "feed")}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <div className="feed-layout compact-feed-layout">
        {feedAction === "feed" ? (
          <section className="subpanel">
          <p className="eyebrow">Catalog</p>
          <h3>Create feed</h3>
          <form className="feed-form" onSubmit={onCreateFeedType}>
            <label>
              Brand
              <input name="brand" required placeholder="Purina" />
            </label>
            <label>
              Feed name
              <input name="name" required placeholder="Game Bird Starter" />
            </label>
            <label>
              Vendor / store
              <input name="vendor" placeholder="Tractor Supply, Chewy, local mill..." />
            </label>
            <label>
              Protein %
              <input name="proteinPercent" type="number" min="0" max="100" step="0.1" />
            </label>
            <label>
              Bag weight, lb
              <input name="bagWeightLb" required type="number" min="0.1" step="0.1" />
            </label>
            <label>
              Bag cost
              <input name="bagCost" required type="number" min="0" step="0.01" />
            </label>
            <label>
              One cup weighs, oz
              <input name="cupWeightOz" required type="number" min="0.1" step="0.1" defaultValue="8" />
            </label>
            <label>
              Bags currently on hand
              <input name="initialBagCount" type="number" min="0" step="0.1" placeholder="Auto-converts to cups" />
            </label>
            <label>
              Inventory cups override
              <input name="inventoryCups" type="number" min="0" step="0.1" placeholder="Optional; leave blank to calculate from bags" />
            </label>
            <p className="muted compact-copy wide-field">
              Inventory cups are calculated as bags × bag weight × 16 ÷ cup weight unless you enter a manual override.
            </p>
            <button disabled={busy} type="submit">
              {busy ? "Saving..." : "Add feed"}
            </button>
          </form>
        </section>
        ) : null}

        {feedAction === "topoff" ? (
          <section className="subpanel">
          <p className="eyebrow">Top-off</p>
          <h3>Log feed added</h3>
          <p className="muted compact-copy">
            Top-off logs subtract from the selected feed's remaining inventory.
          </p>
          <form className="feed-form" onSubmit={onCreateFeedLog}>
            <label>
              Date/time
              <input name="loggedAt" type="datetime-local" />
            </label>
            <label>
              Coop
              <RequiredCoopSelect coops={coops} />
            </label>
            <label>
              Feed
              <FeedTypeSelect feedTypes={feedTypes} />
            </label>
            <label>
              Amount
              <input name="amount" required type="number" min="0.1" step="0.1" />
            </label>
            <label>
              Unit
              <select name="unit" defaultValue={preferredTopOffUnit}>
                <option value="cup">Cups</option>
                <option value="lb">Pounds</option>
                <option value="oz">Ounces</option>
              </select>
            </label>
            <label>
              Notes
              <input name="notes" placeholder="Spills, feeder condition, etc." />
            </label>
            <button disabled={busy || !feedTypes.length || !coops.length} type="submit">
              {busy ? "Saving..." : "Log top-off"}
            </button>
          </form>
        </section>
        ) : null}

        {feedAction === "restock" ? (
          <section className="subpanel">
          <p className="eyebrow">Restock</p>
          <h3>Log feed purchased or added</h3>
          <p className="muted compact-copy">
            Restocks add to remaining inventory. Bags auto-convert to cups from the feed's bag weight and cup weight.
          </p>
          <form className="feed-form" onSubmit={onCreateFeedInventoryEvent}>
            <label>
              Date/time
              <input name="loggedAt" type="datetime-local" />
            </label>
            <label>
              Feed
              <FeedTypeSelect feedTypes={feedTypes} />
            </label>
            <label>
              Amount
              <input name="amount" required type="number" min="0.1" step="0.1" />
            </label>
            <label>
              Unit
              <select name="unit" defaultValue="bag">
                <option value="bag">Bags</option>
                <option value="cup">Cups</option>
                <option value="lb">Pounds</option>
                <option value="oz">Ounces</option>
              </select>
            </label>
            <label>
              Cost, optional
              <input name="cost" type="number" min="0" step="0.01" placeholder="Auto for bags" />
            </label>
            <label>
              Notes
              <input name="notes" placeholder="Store, lot, sale price, etc." />
            </label>
            <button disabled={busy || !feedTypes.length} type="submit">
              {busy ? "Saving..." : "Log restock"}
            </button>
          </form>
        </section>
        ) : null}
      </div>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Catalog</p>
            <h3>Feeds</h3>
            <p className="muted compact-copy">Click a row to open feed details. Select multiple rows for bulk edits.</p>
          </div>
        </div>
        <div className="table-card">
          <div className="table-control-panel">
            <div className="bulk-actions table-bulk-actions" aria-label="Bulk feed actions">
              <span>
                {selectedFeedTypeIds.length > 1
                  ? `${selectedFeedTypeIds.length} selected`
                  : selectedFeedTypeIds.length === 1
                    ? "Select one more for bulk actions"
                    : "Select rows for bulk actions"}
              </span>
              {selectedFeedTypeIds.length > 1 ? (
                <>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkFeedEditing((current) => !current)}>
                    Edit
                  </button>
                  <button className="danger" disabled={busy} type="button" onClick={applyBulkFeedDelete}>
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            {bulkFeedEditing && selectedFeedTypeIds.length > 1 ? (
              <form className="bulk-edit-form" onSubmit={applyBulkFeedEdit}>
                <div>
                  <p className="eyebrow">Bulk edit</p>
                  <strong>Update {selectedFeedTypeIds.length} selected feeds</strong>
                  <span>Fields left as no change will be skipped.</span>
                </div>
                <label>
                  Status
                  <select value={bulkFeedActive} onChange={(event) => setBulkFeedActive(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </label>
                <label>
                  Protein %
                  <input
                    min="0"
                    max="100"
                    placeholder="No change"
                    step="0.1"
                    type="number"
                    value={bulkFeedProtein}
                    onChange={(event) => setBulkFeedProtein(event.target.value)}
                  />
                </label>
                <div className="row-actions">
                  <button disabled={busy || (bulkFeedActive === "NO_CHANGE" && !bulkFeedProtein.trim())} type="submit">
                    Apply changes
                  </button>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkFeedEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          {feedTypes.length ? (
            <div className="feed-list">
              <div className="feed-row feed-table-head">
                <label className="table-select-cell" aria-label="Select visible feeds">
                  <input
                    checked={allFeedTypesSelected}
                    type="checkbox"
                    onChange={(event) =>
                      toggleAllSelectedIds(sortedFeedTypeIds, event.target.checked, setSelectedFeedTypeIds, () => setBulkFeedEditing(false))
                    }
                  />
                </label>
                <button className="sort-button" type="button" onClick={() => toggleFeedSort("name")}>
                  {feedSortLabel("name", "Feed")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleFeedSort("bagCost")}>
                  {feedSortLabel("bagCost", "Bag cost")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleFeedSort("cups")}>
                  {feedSortLabel("cups", "Cups/bag")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleFeedSort("cupCost")}>
                  {feedSortLabel("cupCost", "Cost/cup")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleFeedSort("inventory")}>
                  {feedSortLabel("inventory", "Inventory")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleFeedSort("active")}>
                  {feedSortLabel("active", "Status")}
                </button>
                <span />
              </div>
              {sortedFeedTypes.map((feed) =>
                editingFeedId === feed.id ? (
                  <form
                    className="feed-row edit-feed-row"
                    key={feed.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      onUpdateFeedType(feed.id, event.currentTarget);
                      setEditingFeedId(null);
                    }}
                  >
                    <label>
                      Brand
                      <input name="brand" required defaultValue={feed.brand} />
                    </label>
                    <label>
                      Feed name
                      <input name="name" required defaultValue={feed.name} />
                    </label>
                    <label>
                      Vendor / store
                      <input name="vendor" defaultValue={feed.vendor ?? ""} />
                    </label>
                    <label>
                      Protein %
                      <input name="proteinPercent" type="number" min="0" max="100" step="0.1" defaultValue={feed.protein_percent ?? ""} />
                    </label>
                    <label>
                      Bag weight, lb
                      <input name="bagWeightLb" required type="number" min="0.1" step="0.1" defaultValue={feed.bag_weight_lb} />
                    </label>
                    <label>
                      Bag cost
                      <input name="bagCost" required type="number" min="0" step="0.01" defaultValue={feed.bag_cost} />
                    </label>
                    <label>
                      Cup weight, oz
                      <input name="cupWeightOz" required type="number" min="0.1" step="0.1" defaultValue={feed.cup_weight_oz} />
                    </label>
                    <label>
                      Inventory, cups
                      <input name="inventoryCups" type="number" min="0" step="0.1" defaultValue={feed.inventory_cups} />
                    </label>
                    <label>
                      Status
                      <select name="active" defaultValue={feed.active ? "true" : "false"}>
                        <option value="true">Active</option>
                        <option value="false">Inactive</option>
                      </select>
                    </label>
                    <div className="row-actions">
                      <button disabled={busy} type="submit">Save</button>
                      <button className="secondary" disabled={busy} type="button" onClick={() => setEditingFeedId(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div
                    className="feed-row clickable-row"
                    key={feed.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedFeedId(feed.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") setSelectedFeedId(feed.id);
                    }}
                  >
                    <label className="table-select-cell" aria-label={`Select ${feedTypeLabel(feed)}`} onClick={(event) => event.stopPropagation()}>
                      <input
                        checked={selectedFeedTypeIds.includes(feed.id)}
                        type="checkbox"
                        onChange={() => toggleSelectedId(feed.id, setSelectedFeedTypeIds, () => setBulkFeedEditing(false))}
                      />
                    </label>
                    <div>
                      <strong>{feedTypeLabel(feed)}</strong>
                      <p>
                        {feed.protein_percent ?? "?"}% protein · {numberValue(feed.bag_weight_lb)} lb bag
                      </p>
                    </div>
                    <span>{money(feed.bag_cost)} / bag</span>
                    <span>{cupsPerBag(feed).toFixed(0)} cups/bag</span>
                    <span>{money(costPerCup(feed))} / cup</span>
                    <span>
                      {feedInventoryLabel(feed)}
                      <small>{money(feedInventoryValue(feed))} on hand</small>
                    </span>
                    <span className={`status-chip ${feed.active ? "active" : "retired"}`}>
                      {feed.active ? "Active" : "Inactive"}
                    </span>
                    <span className="row-open-hint">Open</span>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No feeds yet</h3>
              <p>Create a feed before logging top-offs.</p>
            </div>
          )}
        </div>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Inventory</p>
            <h3>Restock history</h3>
            <p className="muted compact-copy">Purchases and additions that increase feed inventory.</p>
          </div>
        </div>
        <div className="table-card">
          <div className="table-control-panel">
            <div className="bulk-actions table-bulk-actions" aria-label="Bulk restock actions">
              <span>
                {selectedRestockIds.length > 1
                  ? `${selectedRestockIds.length} selected`
                  : selectedRestockIds.length === 1
                    ? "Select one more for bulk actions"
                    : "Select rows for bulk actions"}
              </span>
              {selectedRestockIds.length > 1 ? (
                <>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkRestockEditing((current) => !current)}>
                    Edit
                  </button>
                  <button className="danger" disabled={busy} type="button" onClick={applyBulkRestockDelete}>
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            {bulkRestockEditing && selectedRestockIds.length > 1 ? (
              <form className="bulk-edit-form" onSubmit={applyBulkRestockEdit}>
                <div>
                  <p className="eyebrow">Bulk edit</p>
                  <strong>Update {selectedRestockIds.length} selected restocks</strong>
                  <span>Fields left as no change will be skipped.</span>
                </div>
                <label>
                  Feed
                  <select value={bulkRestockFeedId} onChange={(event) => setBulkRestockFeedId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    {feedTypes.map((feed) => (
                      <option key={feed.id} value={feed.id}>{feedTypeLabel(feed)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Unit
                  <select value={bulkRestockUnit} onChange={(event) => setBulkRestockUnit(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    <option value="bag">Bags</option>
                    <option value="cup">Cups</option>
                    <option value="lb">Pounds</option>
                    <option value="oz">Ounces</option>
                  </select>
                </label>
                <label>
                  Notes
                  <input placeholder="No change" value={bulkRestockNotes} onChange={(event) => setBulkRestockNotes(event.target.value)} />
                </label>
                <div className="row-actions">
                  <button
                    disabled={
                      busy ||
                      (bulkRestockFeedId === "NO_CHANGE" && bulkRestockUnit === "NO_CHANGE" && !bulkRestockNotes.trim())
                    }
                    type="submit"
                  >
                    Apply changes
                  </button>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkRestockEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          {feedInventoryEvents.length ? (
            <div className="feed-log-list">
              <div className="feed-log-row feed-log-table-head">
                <label className="table-select-cell" aria-label="Select visible restocks">
                  <input
                    checked={allRestocksSelected}
                    type="checkbox"
                    onChange={(event) =>
                      toggleAllSelectedIds(sortedRestockIds, event.target.checked, setSelectedRestockIds, () => setBulkRestockEditing(false))
                    }
                  />
                </label>
                <button className="sort-button" type="button" onClick={() => toggleRestockSort("date")}>
                  {restockSortLabel("date", "Date")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleRestockSort("feed")}>
                  {restockSortLabel("feed", "Feed")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleRestockSort("amount")}>
                  {restockSortLabel("amount", "Amount")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleRestockSort("cups")}>
                  {restockSortLabel("cups", "Cups")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleRestockSort("cost")}>
                  {restockSortLabel("cost", "Cost")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleRestockSort("cupCost")}>
                  {restockSortLabel("cupCost", "Cost/cup")}
                </button>
                <span />
              </div>
              {sortedRestocks.map((event) =>
                editingRestockId === event.id ? (
                  <form
                    className="feed-log-row edit-feed-log-row"
                    key={event.id}
                    onSubmit={(submitEvent) => {
                      submitEvent.preventDefault();
                      onUpdateFeedInventoryEvent(event.id, submitEvent.currentTarget);
                      setEditingRestockId(null);
                    }}
                  >
                    <label>
                      Date/time
                      <input name="loggedAt" type="datetime-local" defaultValue={toDateTimeInput(event.logged_at)} />
                    </label>
                    <label>
                      Feed
                      <FeedTypeSelect feedTypes={feedTypes} defaultValue={event.feed_type_id} />
                    </label>
                    <label>
                      Amount
                      <input name="amount" required type="number" min="0.1" step="0.1" defaultValue={event.amount} />
                    </label>
                    <label>
                      Unit
                      <select name="unit" defaultValue={event.unit}>
                        <option value="bag">Bags</option>
                        <option value="cup">Cups</option>
                        <option value="lb">Pounds</option>
                        <option value="oz">Ounces</option>
                      </select>
                    </label>
                    <label>
                      Cost
                      <input name="cost" type="number" min="0" step="0.01" defaultValue={event.cost ?? ""} />
                    </label>
                    <label>
                      Notes
                      <input name="notes" defaultValue={event.notes ?? ""} />
                    </label>
                    <div className="row-actions">
                      <button disabled={busy} type="submit">Save</button>
                      <button className="secondary" disabled={busy} type="button" onClick={() => setEditingRestockId(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="feed-log-row" key={event.id}>
                    <label className="table-select-cell" aria-label={`Select restock ${formatDateTime(event.logged_at)}`}>
                      <input
                        checked={selectedRestockIds.includes(event.id)}
                        type="checkbox"
                        onChange={() => toggleSelectedId(event.id, setSelectedRestockIds, () => setBulkRestockEditing(false))}
                      />
                    </label>
                    <div>
                      <strong>{formatDateTime(event.logged_at)}</strong>
                      <p>{event.notes || "No notes."}</p>
                    </div>
                    <span>{event.feed_brand} {event.feed_name}</span>
                    <span>{Number(event.amount).toFixed(1)} {feedInventoryUnitLabel(event.unit, numberValue(event.amount))}</span>
                    <span>{numberValue(event.amount_cups).toFixed(1)} cups</span>
                    <span>{event.cost == null ? "No cost" : money(event.cost)}</span>
                    <span>{event.cost == null ? "Not valued" : `${money(numberValue(event.cost) / Math.max(1, numberValue(event.amount_cups)))} / cup`}</span>
                    <div className="row-actions">
                      <button className="secondary" disabled={busy} type="button" onClick={() => setEditingRestockId(event.id)}>Edit</button>
                      <button
                        className="danger"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          if (confirm("Delete this feed restock?")) onDeleteFeedInventoryEvent(event.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No restocks yet</h3>
              <p>Log feed purchases or additions to build inventory history.</p>
            </div>
          )}
        </div>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Logs</p>
            <h3>Feed top-offs</h3>
            <p className="muted compact-copy">Feeder top-offs by coop, feed, amount, and estimated cost.</p>
          </div>
        </div>
        <div className="table-card">
          <div className="table-control-panel">
            <div className="bulk-actions table-bulk-actions" aria-label="Bulk top-off actions">
              <span>
                {selectedTopOffIds.length > 1
                  ? `${selectedTopOffIds.length} selected`
                  : selectedTopOffIds.length === 1
                    ? "Select one more for bulk actions"
                    : "Select rows for bulk actions"}
              </span>
              {selectedTopOffIds.length > 1 ? (
                <>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkTopOffEditing((current) => !current)}>
                    Edit
                  </button>
                  <button className="danger" disabled={busy} type="button" onClick={applyBulkTopOffDelete}>
                    Delete
                  </button>
                </>
              ) : null}
            </div>
            {bulkTopOffEditing && selectedTopOffIds.length > 1 ? (
              <form className="bulk-edit-form" onSubmit={applyBulkTopOffEdit}>
                <div>
                  <p className="eyebrow">Bulk edit</p>
                  <strong>Update {selectedTopOffIds.length} selected top-offs</strong>
                  <span>Fields left as no change will be skipped.</span>
                </div>
                <label>
                  Coop
                  <select value={bulkTopOffCoopId} onChange={(event) => setBulkTopOffCoopId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    {coops.map((coop) => (
                      <option key={coop.id} value={coop.id}>{coop.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Feed
                  <select value={bulkTopOffFeedId} onChange={(event) => setBulkTopOffFeedId(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    {feedTypes.map((feed) => (
                      <option key={feed.id} value={feed.id}>{feedTypeLabel(feed)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Unit
                  <select value={bulkTopOffUnit} onChange={(event) => setBulkTopOffUnit(event.target.value)}>
                    <option value="NO_CHANGE">No change</option>
                    <option value="cup">Cups</option>
                    <option value="lb">Pounds</option>
                    <option value="oz">Ounces</option>
                  </select>
                </label>
                <label>
                  Notes
                  <input placeholder="No change" value={bulkTopOffNotes} onChange={(event) => setBulkTopOffNotes(event.target.value)} />
                </label>
                <div className="row-actions">
                  <button
                    disabled={
                      busy ||
                      (bulkTopOffCoopId === "NO_CHANGE" &&
                        bulkTopOffFeedId === "NO_CHANGE" &&
                        bulkTopOffUnit === "NO_CHANGE" &&
                        !bulkTopOffNotes.trim())
                    }
                    type="submit"
                  >
                    Apply changes
                  </button>
                  <button className="secondary" disabled={busy} type="button" onClick={() => setBulkTopOffEditing(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}
          </div>
          {feedLogs.length ? (
            <div className="feed-log-list">
              <div className="feed-log-row feed-log-table-head">
                <label className="table-select-cell" aria-label="Select visible top-offs">
                  <input
                    checked={allTopOffsSelected}
                    type="checkbox"
                    onChange={(event) =>
                      toggleAllSelectedIds(sortedTopOffIds, event.target.checked, setSelectedTopOffIds, () => setBulkTopOffEditing(false))
                    }
                  />
                </label>
                <button className="sort-button" type="button" onClick={() => toggleTopOffSort("date")}>
                  {topOffSortLabel("date", "Date")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleTopOffSort("coop")}>
                  {topOffSortLabel("coop", "Coop")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleTopOffSort("feed")}>
                  {topOffSortLabel("feed", "Feed")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleTopOffSort("amount")}>
                  {topOffSortLabel("amount", "Amount")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleTopOffSort("cost")}>
                  {topOffSortLabel("cost", "Cost")}
                </button>
                <button className="sort-button" type="button" onClick={() => toggleTopOffSort("birdCost")}>
                  {topOffSortLabel("birdCost", "/ bird")}
                </button>
                <span />
              </div>
              {sortedTopOffs.map((log) =>
                editingLogId === log.id ? (
                  <form
                    className="feed-log-row edit-feed-log-row"
                    key={log.id}
                    onSubmit={(event) => {
                      event.preventDefault();
                      onUpdateFeedLog(log.id, event.currentTarget);
                      setEditingLogId(null);
                    }}
                  >
                    <label>
                      Date/time
                      <input name="loggedAt" type="datetime-local" defaultValue={toDateTimeInput(log.logged_at)} />
                    </label>
                    <label>
                      Coop
                      <RequiredCoopSelect coops={coops} defaultValue={log.coop_id} />
                    </label>
                    <label>
                      Feed
                      <FeedTypeSelect feedTypes={feedTypes} defaultValue={log.feed_type_id} />
                    </label>
                    <label>
                      Amount
                      <input name="amount" required type="number" min="0.1" step="0.1" defaultValue={log.amount} />
                    </label>
                    <label>
                      Unit
                      <select name="unit" defaultValue={log.unit}>
                        <option value="cup">Cups</option>
                        <option value="lb">Pounds</option>
                        <option value="oz">Ounces</option>
                      </select>
                    </label>
                    <label>
                      Notes
                      <input name="notes" defaultValue={log.notes ?? ""} />
                    </label>
                    <div className="row-actions">
                      <button disabled={busy} type="submit">Save</button>
                      <button className="secondary" disabled={busy} type="button" onClick={() => setEditingLogId(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="feed-log-row" key={log.id}>
                    <label className="table-select-cell" aria-label={`Select top-off ${formatDateTime(log.logged_at)}`}>
                      <input
                        checked={selectedTopOffIds.includes(log.id)}
                        type="checkbox"
                        onChange={() => toggleSelectedId(log.id, setSelectedTopOffIds, () => setBulkTopOffEditing(false))}
                      />
                    </label>
                    <div>
                      <strong>{formatDateTime(log.logged_at)}</strong>
                      <p>{log.notes || "No notes."}</p>
                    </div>
                    <span>{log.coop_name}</span>
                    <span>{log.feed_brand} {log.feed_name}</span>
                    <span>{Number(log.amount).toFixed(1)} {feedUnitLabel(log.unit, numberValue(log.amount))}</span>
                    <span>{money(log.cost)}</span>
                    <span>
                      {numberValue(log.active_bird_count)
                        ? `${money(numberValue(log.cost) / numberValue(log.active_bird_count))} / bird`
                        : "No active birds"}
                    </span>
                    <div className="row-actions">
                      <button className="secondary" disabled={busy} type="button" onClick={() => setEditingLogId(log.id)}>Edit</button>
                      <button
                        className="danger"
                        disabled={busy}
                        type="button"
                        onClick={() => {
                          if (confirm("Delete this feed log?")) onDeleteFeedLog(log.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No feed logs yet</h3>
              <p>Log a top-off to start building cost metrics.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function FeedTypeDetail({
  busy,
  feed,
  feedInventoryEvents,
  feedLogs,
  homestead,
  photoAttachments,
  onBack,
  onDeleteFeedType,
  onDeletePhoto,
  onCreatePhoto,
  onUpdateFeedType
}: {
  busy: boolean;
  feed: FeedType;
  feedInventoryEvents: FeedInventoryEvent[];
  feedLogs: FeedLog[];
  homestead: Homestead;
  photoAttachments: PhotoAttachment[];
  onBack: () => void;
  onDeleteFeedType: (id: string) => void;
  onDeletePhoto: (id: string) => void;
  onCreatePhoto: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateFeedType: (id: string, form: HTMLFormElement) => void;
}) {
  const preferredFeedUnit = normalizeFeedTopOffUnit(
    homestead.preferences.feedTopOffUnit ?? homestead.preferences.feedTopoffUnit
  );
  const feedEvents = feedInventoryEvents.filter((event) => event.feed_type_id === feed.id);
  const topOffs = feedLogs.filter((log) => log.feed_type_id === feed.id);
  const totalTopOffCups = topOffs.reduce((sum, log) => {
    if (log.unit === "cup") return sum + numberValue(log.amount);
    if (log.unit === "oz") return sum + numberValue(log.amount) / numberValue(feed.cup_weight_oz);
    return sum + (numberValue(log.amount) * 16) / numberValue(feed.cup_weight_oz);
  }, 0);
  const totalTopOffCost = topOffs.reduce((sum, log) => sum + numberValue(log.cost), 0);
  const totalRestockCost = feedEvents.reduce((sum, event) => sum + numberValue(event.cost), 0);
  const averageTopOffCost = topOffs.length ? totalTopOffCost / topOffs.length : 0;
  const coopsUsingFeed = Array.from(new Set(topOffs.map((log) => log.coop_name))).filter(Boolean);
  const maxValueBar = Math.max(1, totalTopOffCost, totalRestockCost, feedInventoryValue(feed));

  return (
    <section className="panel detail-page">
      <div className="dashboard-header">
        <div className="detail-title-with-avatar">
          <ProfilePhoto
            busy={busy}
            entityId={feed.id}
            entityType="FEED"
            fallbackText={initials(feedTypeLabel(feed)) || "F"}
            photos={photoAttachments}
            title="Feed photo"
            onCreatePhoto={onCreatePhoto}
          />
          <div>
            <p className="eyebrow">Feed detail</p>
            <h2>{feedTypeLabel(feed)}</h2>
            <p className="muted">
              {feed.protein_percent ?? "?"}% protein · {numberValue(feed.bag_weight_lb)} lb bag · {feed.vendor || "vendor not recorded"} · preferred tracking unit: {preferredFeedUnit}
            </p>
          </div>
        </div>
        <div className="detail-header-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Back to feed
          </button>
          <button
            className="danger"
            disabled={busy}
            type="button"
            onClick={() => {
              if (confirm(`Delete ${feedTypeLabel(feed)}?`)) {
                onDeleteFeedType(feed.id);
                onBack();
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Feed detail summary">
        <article className="metric-card">
          <p className="eyebrow">Bag cost</p>
          <strong>{money(feed.bag_cost)}</strong>
          <span>{cupsPerBag(feed).toFixed(0)} cups per bag</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Cost per cup</p>
          <strong>{money(costPerCup(feed))}</strong>
          <span>{numberValue(feed.cup_weight_oz)} oz per cup</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Inventory</p>
          <strong>{numberValue(feed.inventory_cups).toFixed(1)} cups</strong>
          <span>{money(feedInventoryValue(feed))} on hand</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Top-offs</p>
          <strong>{topOffs.length}</strong>
          <span>{totalTopOffCups.toFixed(1)} cups logged</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Logged cost</p>
          <strong>{money(totalTopOffCost)}</strong>
          <span>{money(averageTopOffCost)} average top-off</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Used by</p>
          <strong>{coopsUsingFeed.length}</strong>
          <span>{coopsUsingFeed.join(", ") || "No coops yet"}</span>
        </article>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Cost movement</p>
            <h3>Inventory and use</h3>
            <p className="muted compact-copy">Bars compare restock value, top-off cost, and current inventory value.</p>
          </div>
        </div>
        <div className="table-card value-card">
          <div className="value-chart" aria-label="Feed cost chart">
            {[
              { label: "Restock value", value: totalRestockCost, tone: "positive" },
              { label: "Top-off cost", value: totalTopOffCost, tone: "cost" },
              { label: "On hand", value: feedInventoryValue(feed), tone: "positive" }
            ].map((item) => (
              <article key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{money(item.value)}</span>
                </div>
                <div className="value-bar-track">
                  <div
                    className={`value-bar-fill ${item.tone}`}
                    style={{ width: `${Math.max(3, (item.value / maxValueBar) * 100)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="feed-layout">
        <section className="subpanel">
          <p className="eyebrow">Recent top-offs</p>
          <h3>Usage history</h3>
          {topOffs.length ? (
            <div className="source-summary">
              {topOffs.slice(0, 8).map((log) => (
                <article key={log.id}>
                  <div>
                    <strong>{formatDateTime(log.logged_at)}</strong>
                    <span>
                      {log.coop_name} · {Number(log.amount).toFixed(1)} {feedUnitLabel(log.unit, numberValue(log.amount))} · {money(log.cost)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No top-offs logged for this feed yet.</p>
          )}
        </section>

        <section className="subpanel">
          <p className="eyebrow">Recent restocks</p>
          <h3>Inventory history</h3>
          {feedEvents.length ? (
            <div className="source-summary">
              {feedEvents.slice(0, 8).map((event) => (
                <article key={event.id}>
                  <div>
                    <strong>{formatDateTime(event.logged_at)}</strong>
                    <span>
                      {Number(event.amount).toFixed(1)} {feedInventoryUnitLabel(event.unit, numberValue(event.amount))} ·{" "}
                      {numberValue(event.amount_cups).toFixed(1)} cups · {event.cost == null ? "no cost" : money(event.cost)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">No restocks logged for this feed yet.</p>
          )}
        </section>
      </div>

      <CreateRecordPanel buttonLabel="Edit feed" eyebrow="Record" title="Edit feed">
        <form
          className="feed-form"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateFeedType(feed.id, event.currentTarget);
          }}
        >
          <label>
            Brand
            <input name="brand" required defaultValue={feed.brand} />
          </label>
          <label>
            Feed name
            <input name="name" required defaultValue={feed.name} />
          </label>
          <label>
            Vendor / store
            <input name="vendor" defaultValue={feed.vendor ?? ""} />
          </label>
          <label>
            Protein %
            <input name="proteinPercent" type="number" min="0" max="100" step="0.1" defaultValue={feed.protein_percent ?? ""} />
          </label>
          <label>
            Bag weight, lb
            <input name="bagWeightLb" required type="number" min="0.1" step="0.1" defaultValue={feed.bag_weight_lb} />
          </label>
          <label>
            Bag cost
            <input name="bagCost" required type="number" min="0" step="0.01" defaultValue={feed.bag_cost} />
          </label>
          <label>
            Cup weight, oz
            <input name="cupWeightOz" required type="number" min="0.1" step="0.1" defaultValue={feed.cup_weight_oz} />
          </label>
          <label>
            Inventory, cups
            <input name="inventoryCups" type="number" min="0" step="0.1" defaultValue={feed.inventory_cups} />
          </label>
          <label>
            Status
            <select name="active" defaultValue={feed.active ? "true" : "false"}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </label>
          <div className="row-actions">
            <button disabled={busy} type="submit">Save feed</button>
          </div>
        </form>
      </CreateRecordPanel>
    </section>
  );
}

function FeedTypeSelect({ feedTypes, defaultValue = "" }: { feedTypes: FeedType[]; defaultValue?: string }) {
  return (
    <select name="feedTypeId" required defaultValue={defaultValue}>
      <option value="">Select feed</option>
      {feedTypes
        .filter((feed) => feed.active || feed.id === defaultValue)
        .map((feed) => (
          <option key={feed.id} value={feed.id}>
            {feedTypeLabel(feed)}
          </option>
        ))}
    </select>
  );
}

function BreedingLineSelect({
  breedingLines,
  defaultValue = "",
  required = false
}: {
  breedingLines: BreedingLine[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <select name="breedingLineId" required={required} defaultValue={defaultValue}>
      <option value="">{required ? "Select line" : "No line"}</option>
      {breedingLines
        .filter((line) => line.active || line.id === defaultValue)
        .map((line) => (
          <option key={line.id} value={line.id}>
            {line.name}
          </option>
        ))}
    </select>
  );
}

function MatingPeriodSelect({
  matingPeriods,
  defaultValue = ""
}: {
  matingPeriods: MatingPeriod[];
  defaultValue?: string;
}) {
  return (
    <select name="matingPeriodId" defaultValue={defaultValue}>
      <option value="">No mating period</option>
      {matingPeriods
        .filter((period) => !period.ended_on || period.id === defaultValue)
        .map((period) => (
          <option key={period.id} value={period.id}>
            {period.breeding_line_name}: {period.label}
          </option>
        ))}
    </select>
  );
}

function SireSelect({ birds, defaultValue = "" }: { birds: Bird[]; defaultValue?: string }) {
  return (
    <select name="sireId" defaultValue={defaultValue}>
      <option value="">Unknown sire</option>
      {birds
        .filter((bird) => bird.status === "ACTIVE" || bird.id === defaultValue)
        .map((bird) => (
          <option key={bird.id} value={bird.id}>
            {birdLabel(bird)}
          </option>
        ))}
    </select>
  );
}

function HenCheckboxes({ birds, selectedIds = [] }: { birds: Bird[]; selectedIds?: string[] }) {
  const selectedSet = new Set(selectedIds);
  return (
    <div className="hen-picker">
      {birds.length ? (
        birds.map((bird) => (
          <label className="check-row" key={bird.id}>
            <input name="henIds" type="checkbox" value={bird.id} defaultChecked={selectedSet.has(bird.id)} />
            {birdLabel(bird)}
          </label>
        ))
      ) : (
        <span className="muted">No active hens yet.</span>
      )}
    </div>
  );
}

function RequiredCoopSelect({ coops, defaultValue = "" }: { coops: Coop[]; defaultValue?: string }) {
  return (
    <select name="coopId" required defaultValue={defaultValue}>
      <option value="">Select coop</option>
      {coops.map((coop) => (
        <option key={coop.id} value={coop.id}>
          {coop.name}
        </option>
      ))}
    </select>
  );
}

function feedUnitLabel(unit: FeedLog["unit"], amount: number) {
  if (unit === "cup") return amount === 1 ? "cup" : "cups";
  if (unit === "lb") return amount === 1 ? "lb" : "lb";
  return "oz";
}

function feedInventoryUnitLabel(unit: FeedInventoryEvent["unit"], amount: number) {
  if (unit === "bag") return amount === 1 ? "bag" : "bags";
  if (unit === "cup") return amount === 1 ? "cup" : "cups";
  if (unit === "lb") return "lb";
  return "oz";
}

function toDateTimeInput(value: string) {
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function CreateRecordPanel({
  buttonLabel,
  children,
  description,
  eyebrow,
  title
}: {
  buttonLabel: string;
  children: ReactNode;
  description?: string;
  eyebrow: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className={`create-record-panel ${open ? "open" : ""}`}>
      <button className="secondary create-record-toggle" type="button" onClick={() => setOpen((current) => !current)}>
        <span>{open ? "Hide form" : buttonLabel}</span>
        <b>{open ? "−" : "+"}</b>
      </button>
      {open ? (
        <div className="create-record-body">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h3>{title}</h3>
            {description ? <p className="muted compact-copy">{description}</p> : null}
          </div>
          {children}
        </div>
      ) : null}
    </section>
  );
}

function RecordList({ children, emptyText, title }: { children: ReactNode; emptyText: string; title: string }) {
  const count = Array.isArray(children) ? children.length : 0;

  return (
    <section className="subpanel table-section">
      <div className="table-section-header">
        <div>
          <p className="eyebrow">Records</p>
          <h3>{title}</h3>
          <p className="muted compact-copy">{count ? `${count} records shown` : emptyText}</p>
        </div>
      </div>
      <div className="table-card card-list-table">
        {count === 0 ? (
          <div className="empty-state">
            <h3>No records yet</h3>
            <p>{emptyText}</p>
          </div>
        ) : (
          <div className="source-summary record-card-list">{children}</div>
        )}
      </div>
    </section>
  );
}

function OptionalCoopSelect({ coops, defaultValue = "" }: { coops: Coop[]; defaultValue?: string }) {
  return (
    <select name="coopId" defaultValue={defaultValue}>
      <option value="">No coop</option>
      {coops.map((coop) => (
        <option key={coop.id} value={coop.id}>{coop.name}</option>
      ))}
    </select>
  );
}

function OptionalBirdSelect({ birds, defaultValue = "" }: { birds: Bird[]; defaultValue?: string }) {
  return (
    <select name="birdId" defaultValue={defaultValue}>
      <option value="">No bird</option>
      {birds.map((bird) => (
        <option key={bird.id} value={bird.id}>{birdLabel(bird)}</option>
      ))}
    </select>
  );
}

function OptionalIncubationSelect({ incubations, defaultValue = "" }: { incubations: Incubation[]; defaultValue?: string }) {
  return (
    <select name="incubationId" defaultValue={defaultValue}>
      <option value="">No incubation</option>
      {incubations.map((cycle) => (
        <option key={cycle.id} value={cycle.id}>{cycle.label}</option>
      ))}
    </select>
  );
}

function OptionalHatchBatchSelect({ hatchBatches, defaultValue = "" }: { hatchBatches: HatchBatch[]; defaultValue?: string }) {
  return (
    <select name="hatchBatchId" defaultValue={defaultValue}>
      <option value="">No hatch batch</option>
      {hatchBatches.map((batch) => (
        <option key={batch.id} value={batch.id}>{batch.label}</option>
      ))}
    </select>
  );
}

function ProfilePhoto({
  busy,
  entityId,
  entityType,
  fallbackText,
  photos,
  title,
  onCreatePhoto
}: {
  busy: boolean;
  entityId: string;
  entityType: PhotoEntityType;
  fallbackText: string;
  photos: PhotoAttachment[];
  title: string;
  onCreatePhoto: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const primaryPhoto = photos
    .filter((photo) => photo.entity_type === entityType && photo.entity_id === entityId)
    .sort((a, b) => compareValues(b.created_at, a.created_at))[0];
  const fallback = fallbackText.slice(0, 2).toUpperCase() || "•";

  return (
    <div className="profile-photo-control" aria-label={title}>
      <form className="profile-photo-form" onSubmit={onCreatePhoto}>
        <input name="entityType" readOnly type="hidden" value={entityType} />
        <input name="entityId" readOnly type="hidden" value={entityId} />
        <label className={`profile-photo-frame ${busy ? "disabled" : ""}`} title={primaryPhoto ? "Change photo" : "Add photo"}>
          {primaryPhoto ? (
            <PhotoImage alt={primaryPhoto.caption || primaryPhoto.file_name} photoId={primaryPhoto.id} />
          ) : (
            <div className="profile-photo-default" aria-hidden="true">{fallback}</div>
          )}
          <span className="visually-hidden">{primaryPhoto ? "Change photo" : "Add photo"}</span>
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            disabled={busy}
            name="photo"
            type="file"
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          />
        </label>
      </form>
    </div>
  );
}

function PhotoImage({ alt, photoId }: { alt: string; photoId: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";

    fetch(`${apiUrl}/photos/${photoId}/content`, { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("Photo unavailable.");
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  return src ? <img alt={alt} src={src} /> : <div className="photo-placeholder">Photo unavailable</div>;
}

function WorkList({
  customItems = [],
  dismissedCount = 0,
  emptyDetail,
  eyebrow,
  items,
  onCompleteCustom,
  onCreateCustom,
  onDeleteCustom,
  onDismiss,
  onNavigate,
  onRestoreCustom,
  onRestoreDismissed,
  title
}: {
  customItems?: CustomWorkItem[];
  dismissedCount?: number;
  emptyDetail: string;
  eyebrow: string;
  items: WorkItem[];
  onCompleteCustom?: (id: string) => void;
  onCreateCustom?: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteCustom?: (id: string) => void;
  onDismiss?: (id: string) => void;
  onNavigate: (section: DashboardSection) => void;
  onRestoreCustom?: (id: string) => void;
  onRestoreDismissed?: () => void;
  title: string;
}) {
  const [sort, setSort] = useState<{ key: WorkSortKey; dir: SortDirection }>({ key: "priority", dir: "asc" });
  const sortedItems = [...items].sort((a, b) => {
    const value = (item: WorkItem) => {
      if (sort.key === "priority") return priorityRank(item.priority);
      if (sort.key === "date") return normalizeDateKey(item.dueDate) || "9999-12-31";
      if (sort.key === "section") return sectionTitle(item.section);
      return item.title || "";
    };
    return compareValues(value(a), value(b)) * (sort.dir === "asc" ? 1 : -1);
  });

  function updateSort(key: WorkSortKey) {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "asc" ? "desc" : "asc"
    }));
  }

  function sortLabel(key: WorkSortKey, label: string) {
    return `${label}${sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}`;
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="muted">
            {items.length} {items.length === 1 ? "item" : "items"} currently need attention.
          </p>
        </div>
      </div>

      {onCreateCustom ? <CustomTaskForm onCreateCustom={onCreateCustom} /> : null}

      {items.length ? (
        <>
          <div className="work-controls">
            <span>Sort by</span>
            <button className="secondary" type="button" onClick={() => updateSort("priority")}>
              {sortLabel("priority", "Priority")}
            </button>
            <button className="secondary" type="button" onClick={() => updateSort("date")}>
              {sortLabel("date", "Date")}
            </button>
            <button className="secondary" type="button" onClick={() => updateSort("section")}>
              {sortLabel("section", "Area")}
            </button>
            <button className="secondary" type="button" onClick={() => updateSort("title")}>
              {sortLabel("title", "Title")}
            </button>
            {dismissedCount && onRestoreDismissed ? (
              <button className="secondary" type="button" onClick={onRestoreDismissed}>
                Restore {dismissedCount} dismissed
              </button>
            ) : null}
          </div>
          <div className="work-list">
          {sortedItems.map((item) => (
            <article className={`work-card priority-${item.priority}`} key={item.id}>
              <div>
                <span className={`priority-badge ${item.priority}`}>
                  {item.priority}
                  {item.dueDate ? ` · ${displayDate(item.dueDate)}` : ""}
                </span>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
	              <div className="work-actions">
	                <button className="secondary" type="button" onClick={() => onNavigate(item.section)}>
	                  Open {sectionTitle(item.section)}
	                </button>
                  {item.kind === "custom" && onCompleteCustom ? (
                    <button type="button" onClick={() => onCompleteCustom(item.id)}>
                      Complete
                    </button>
                  ) : null}
	                {onDismiss ? (
	                  <button className="secondary" type="button" onClick={() => onDismiss(item.id)}>
	                    Dismiss
	                  </button>
	                ) : null}
              </div>
            </article>
          ))}
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h3>All clear</h3>
          <p>{emptyDetail}</p>
          {dismissedCount && onRestoreDismissed ? (
            <button className="secondary" type="button" onClick={onRestoreDismissed}>
              Restore {dismissedCount} dismissed
            </button>
          ) : null}
	        </div>
	      )}
      {customItems.some((item) => item.completedAt) && onRestoreCustom ? (
        <section className="subpanel completed-work">
          <p className="eyebrow">Completed</p>
          <h3>Custom task history</h3>
          <div className="work-list compact">
            {customItems
              .filter((item) => item.completedAt)
              .slice(0, 8)
              .map((item) => (
                <article className="work-card priority-low" key={item.id}>
                  <div>
                    <span className="priority-badge low">done · {displayDate(item.dueDate)}</span>
                    <strong>{item.title}</strong>
                    <p>{item.detail || "Completed custom task."}</p>
                  </div>
                  <div className="work-actions">
                    <button className="secondary" type="button" onClick={() => onRestoreCustom(item.id)}>
                      Restore
                    </button>
                    {onDeleteCustom ? (
                      <button className="danger" type="button" onClick={() => onDeleteCustom(item.id)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function CustomTaskForm({ onCreateCustom }: { onCreateCustom: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <CreateRecordPanel
      buttonLabel="Add custom task"
      eyebrow="Custom"
      title="Add keeper task"
      description="Use custom tasks for one-off chores or reminders that Covey cannot infer from records yet."
    >
      <form className="feed-form" onSubmit={onCreateCustom}>
        <label>
          Title
          <input name="title" required placeholder="Clean brooder trays" />
        </label>
        <label>
          Due date
          <input name="dueDate" required type="date" defaultValue={dateKeyDaysAgo(0)} />
        </label>
        <label>
          Priority
          <select name="priority" defaultValue="medium">
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Area
          <select name="section" defaultValue="todos">
            {dashboardSections
              .filter((section) => !["overview", "settings", "audit", "calendar", "recommendations"].includes(section))
              .map((section) => (
                <option key={section} value={section}>
                  {sectionTitle(section)}
                </option>
              ))}
          </select>
        </label>
        <label className="wide-field">
          Details
          <input name="detail" placeholder="Optional notes, supplies, or context" />
        </label>
        <button type="submit">Add task</button>
      </form>
    </CreateRecordPanel>
  );
}

function WorkCalendar({
  customItems,
  items,
  onCompleteCustom,
  onCreateCustom,
  onDeleteCustom,
  onDismissRecommendation,
  onDismissTodo,
  onNavigate,
  onRestoreCustom
}: {
  customItems: CustomWorkItem[];
  items: WorkItem[];
  onCompleteCustom: (id: string) => void;
  onCreateCustom: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteCustom: (id: string) => void;
  onDismissRecommendation: (id: string) => void;
  onDismissTodo: (id: string) => void;
  onNavigate: (section: DashboardSection) => void;
  onRestoreCustom: (id: string) => void;
}) {
  const [scope, setScope] = useState<"active" | "completed">("active");
  const [visibleMonth, setVisibleMonth] = useState(monthKey(dateKeyDaysAgo(0)));
  const [selectedDate, setSelectedDate] = useState(dateKeyDaysAgo(0));
  const [kindFilter, setKindFilter] = useState<CalendarKindFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<CalendarPriorityFilter>("all");
  const [sectionFilter, setSectionFilter] = useState<CalendarSectionFilter>("all");
  const today = dateKeyDaysAgo(0);
  const visibleMonthDate = new Date(`${visibleMonth}-01T12:00:00`);
  const visibleYear = visibleMonthDate.getFullYear();
  const visibleMonthIndex = visibleMonthDate.getMonth();
  const yearOptions = Array.from({ length: 11 }, (_, index) => visibleYear - 5 + index);
  const activeItems = items.filter((item) => normalizeDateKey(item.dueDate));
  const completedItems = customItems
    .filter((item) => item.completedAt)
    .map(customWorkToWorkItem)
    .map((item) => ({ ...item, kind: "custom" as const }));
  const scopedItems = (scope === "completed" ? completedItems : activeItems).filter((item) => {
    const kind = item.kind ?? "todo";
    return (
      (kindFilter === "all" || kind === kindFilter) &&
      (priorityFilter === "all" || item.priority === priorityFilter) &&
      (sectionFilter === "all" || item.section === sectionFilter)
    );
  });
  const itemsByDate = scopedItems.reduce<Map<string, WorkItem[]>>((groups, item) => {
    const date = normalizeDateKey(item.dueDate);
    if (!date) return groups;
    const current = groups.get(date) ?? [];
    current.push(item);
    groups.set(date, current);
    return groups;
  }, new Map());
  const calendarDates = calendarGridDates(visibleMonth);
  const monthItemCount = calendarDates.reduce((total, date) => total + (itemsByDate.get(date)?.length ?? 0), 0);
  const selectedMonthItems = Array.from(itemsByDate.entries())
    .filter(([date]) => monthKey(date) === visibleMonth)
    .flatMap(([, dayItems]) => dayItems);
  const selectedDayItems = [...(itemsByDate.get(selectedDate) ?? [])].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || compareValues(a.title, b.title)
  );
  const todayItems = itemsByDate.get(today)?.length ?? 0;
  const highPriorityCount = scopedItems.filter((item) => item.priority === "high").length;
  const availableSections = Array.from(new Set(scopedItems.map((item) => item.section))).sort((a, b) =>
    compareValues(sectionTitle(a), sectionTitle(b))
  );

  function dismissItem(item: WorkItem) {
    if (item.kind === "recommendation") onDismissRecommendation(item.id);
    else onDismissTodo(item.id);
  }

  function itemKindLabel(item: WorkItem) {
    return item.kind === "custom" ? "custom" : item.kind === "recommendation" ? "suggestion" : "system";
  }

  function resetCalendarFilters() {
    setKindFilter("all");
    setPriorityFilter("all");
    setSectionFilter("all");
  }

  function selectCalendarDate(date: string) {
    setSelectedDate(date);
    setVisibleMonth(monthKey(date));
  }

  function setCalendarMonth(year: number, monthIndex: number) {
    const nextMonth = monthKeyFromParts(year, monthIndex);
    setVisibleMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>Unified work calendar</h2>
          <p className="muted">
            System reminders, recommendations with dates, and custom keeper tasks are grouped by due date.
          </p>
        </div>
      </div>

      <CustomTaskForm onCreateCustom={onCreateCustom} />

      <section className="calendar-summary" aria-label="Calendar summary">
        <article>
          <p className="eyebrow">This view</p>
          <strong>{monthItemCount}</strong>
          <span>scheduled items</span>
        </article>
        <article>
          <p className="eyebrow">Today</p>
          <strong>{todayItems}</strong>
          <span>{displayDate(today)}</span>
        </article>
        <article>
          <p className="eyebrow">High priority</p>
          <strong>{highPriorityCount}</strong>
          <span>matching filters</span>
        </article>
        <article>
          <p className="eyebrow">Selected day</p>
          <strong>{selectedDayItems.length}</strong>
          <span>{displayDate(selectedDate)}</span>
        </article>
      </section>

      <div className="work-controls calendar-controls">
        <button
          className="secondary"
          type="button"
          onClick={() => {
            const nextMonth = shiftMonth(visibleMonth, -1);
            setVisibleMonth(nextMonth);
            setSelectedDate(`${nextMonth}-01`);
          }}
        >
          Previous
        </button>
        <strong>{monthLabel(visibleMonth)}</strong>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            const nextMonth = shiftMonth(visibleMonth, 1);
            setVisibleMonth(nextMonth);
            setSelectedDate(`${nextMonth}-01`);
          }}
        >
          Next
        </button>
        <label className="calendar-jump">
          <span>Month</span>
          <select value={visibleMonthIndex} onChange={(event) => setCalendarMonth(visibleYear, Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index} value={index}>
                {new Date(2026, index, 1).toLocaleDateString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
        </label>
        <label className="calendar-jump">
          <span>Year</span>
          <select value={visibleYear} onChange={(event) => setCalendarMonth(Number(event.target.value), visibleMonthIndex)}>
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setVisibleMonth(monthKey(today));
            setSelectedDate(today);
          }}
        >
          Today
        </button>
        <span>{monthItemCount} scheduled this view</span>
        {(["active", "completed"] as const).map((option) => (
          <button
            className={`secondary ${scope === option ? "active" : ""}`}
            key={option}
            type="button"
            onClick={() => setScope(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <section className="calendar-filter-panel">
        <label>
          Type
          <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as CalendarKindFilter)}>
            <option value="all">All types</option>
            <option value="todo">System tasks</option>
            <option value="recommendation">Recommendations</option>
            <option value="custom">Custom chores</option>
          </select>
        </label>
        <label>
          Priority
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as CalendarPriorityFilter)}>
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Area
          <select value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value as CalendarSectionFilter)}>
            <option value="all">All areas</option>
            {availableSections.map((section) => (
              <option key={section} value={section}>{sectionTitle(section)}</option>
            ))}
          </select>
        </label>
        <button className="secondary" type="button" onClick={resetCalendarFilters}>
          Reset filters
        </button>
      </section>

      <div className="month-calendar" role="grid" aria-label={`${monthLabel(visibleMonth)} work calendar`}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div className="calendar-weekday" key={day}>
            {day}
          </div>
        ))}
        {calendarDates.map((date) => {
          const dayItems = [...(itemsByDate.get(date) ?? [])].sort(
            (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || compareValues(a.title, b.title)
          );
          const isCurrentMonth = monthKey(date) === visibleMonth;
          const isToday = date === today;
          const isSelected = date === selectedDate;

          return (
            <section
              className={`calendar-cell clickable-row ${isCurrentMonth ? "" : "outside"} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
              key={date}
              role="button"
              tabIndex={0}
              onClick={() => selectCalendarDate(date)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") selectCalendarDate(date);
              }}
            >
              <div className="calendar-cell-head">
                <strong>{Number(date.slice(8, 10))}</strong>
                <div>
                  {isToday ? <span>Today</span> : null}
                  {dayItems.length ? <span>{dayItems.length}</span> : null}
                </div>
              </div>
              <div className="calendar-cell-items">
                {dayItems.slice(0, 4).map((item) => (
                  <article className={`calendar-item priority-${item.priority}`} key={`${item.kind}-${item.id}`}>
                    <button
                      className="calendar-item-title"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onNavigate(item.section);
                      }}
                    >
                      {item.title}
                    </button>
                    <span>
                      {itemKindLabel(item)} · {item.priority} · {sectionTitle(item.section)}
                    </span>
                    <div className="calendar-item-actions">
                      {scope === "completed" && item.kind === "custom" ? (
                        <>
                          <button className="link-button" type="button" onClick={(event) => {
                            event.stopPropagation();
                            onRestoreCustom(item.id);
                          }}>
                            Restore
                          </button>
                          <button className="link-button danger-link" type="button" onClick={(event) => {
                            event.stopPropagation();
                            onDeleteCustom(item.id);
                          }}>
                            Delete
                          </button>
                        </>
                      ) : item.kind === "custom" ? (
                        <button className="link-button" type="button" onClick={(event) => {
                          event.stopPropagation();
                          onCompleteCustom(item.id);
                        }}>
                          Complete
                        </button>
                      ) : (
                        <button className="link-button" type="button" onClick={(event) => {
                          event.stopPropagation();
                          dismissItem(item);
                        }}>
                          Dismiss
                        </button>
                      )}
                    </div>
                  </article>
                ))}
                {dayItems.length > 4 ? <span className="calendar-more">+{dayItems.length - 4} more</span> : null}
              </div>
            </section>
          );
        })}
      </div>

      <section className="calendar-day-detail">
        <div className="dashboard-header small-header">
          <div>
            <p className="eyebrow">Day detail</p>
            <h3>{displayDate(selectedDate)}</h3>
            <p className="muted">
              {selectedDayItems.length
                ? `${selectedDayItems.length} matching ${selectedDayItems.length === 1 ? "item" : "items"} for this day.`
                : "No matching items for this day."}
            </p>
          </div>
          <button className="secondary" type="button" onClick={() => selectCalendarDate(today)}>
            Select today
          </button>
        </div>
        {selectedDayItems.length ? (
          <div className="work-list compact">
            {selectedDayItems.map((item) => (
              <article className={`work-card priority-${item.priority}`} key={`${item.kind}-day-${item.id}`}>
                <div>
                  <span className={`priority-badge ${item.priority}`}>
                    {itemKindLabel(item)} · {item.priority} · {sectionTitle(item.section)}
                  </span>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <div className="work-actions">
                  <button className="secondary" type="button" onClick={() => onNavigate(item.section)}>
                    Open {sectionTitle(item.section)}
                  </button>
                  {scope === "completed" && item.kind === "custom" ? (
                    <>
                      <button type="button" onClick={() => onRestoreCustom(item.id)}>Restore</button>
                      <button className="danger" type="button" onClick={() => onDeleteCustom(item.id)}>Delete</button>
                    </>
                  ) : item.kind === "custom" ? (
                    <button type="button" onClick={() => onCompleteCustom(item.id)}>Complete</button>
                  ) : (
                    <button className="secondary" type="button" onClick={() => dismissItem(item)}>Dismiss</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <h3>Open day</h3>
            <p>Pick another day, loosen filters, or add a custom task for this date.</p>
          </div>
        )}
      </section>

      {selectedMonthItems.length ? (
        <div className="calendar-agenda">
          <p className="eyebrow">Filtered month agenda</p>
          <div className="work-list compact">
            {selectedMonthItems
              .sort((a, b) => compareValues(normalizeDateKey(a.dueDate), normalizeDateKey(b.dueDate)) || priorityRank(a.priority) - priorityRank(b.priority))
              .slice(0, 20)
              .map((item) => (
                <article className={`work-card priority-${item.priority}`} key={`${item.kind}-agenda-${item.id}`}>
                  <div>
                    <span className={`priority-badge ${item.priority}`}>
                      {displayDate(item.dueDate)} · {itemKindLabel(item)} · {item.priority}
                    </span>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </div>
                  <div className="work-actions">
                    <button className="secondary" type="button" onClick={() => onNavigate(item.section)}>
                      Open {sectionTitle(item.section)}
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <h3>No items in {monthLabel(visibleMonth)}</h3>
          <p>Add a custom task, wait for system reminders, or reset filters to widen this month.</p>
        </div>
      )}
    </section>
  );
}

function SalesManager({
  birds,
  breedingLines,
  busy,
  coops,
  hatchBatches,
  incubations,
  matingPeriods,
  sales,
  onCreateSale,
  onDeleteSale,
  onUpdateSale
}: {
  birds: Bird[];
  breedingLines: BreedingLine[];
  busy: boolean;
  coops: Coop[];
  hatchBatches: HatchBatch[];
  incubations: Incubation[];
  matingPeriods: MatingPeriod[];
  sales: SaleRecord[];
  onCreateSale: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, form: HTMLFormElement) => void;
}) {
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const totalRevenue = sales.reduce((sum, sale) => sum + numberValue(sale.total_price), 0);
  const monthStart = dateKeyDaysAgo(30);
  const recentRevenue = sales
    .filter((sale) => normalizeDateKey(sale.sold_on) >= monthStart)
    .reduce((sum, sale) => sum + numberValue(sale.total_price), 0);
  const selectedSale = sales.find((sale) => sale.id === selectedSaleId) ?? null;

  if (selectedSale) {
    return (
      <SaleDetail
        birds={birds}
        breedingLines={breedingLines}
        busy={busy}
        coops={coops}
        hatchBatches={hatchBatches}
        incubations={incubations}
        matingPeriods={matingPeriods}
        sale={selectedSale}
        onBack={() => setSelectedSaleId(null)}
        onDeleteSale={onDeleteSale}
        onUpdateSale={onUpdateSale}
      />
    );
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Sales</p>
          <h2>Revenue tracking</h2>
          <p className="muted">Track sold eggs, chicks, birds, meat, and other flock revenue for ROI reporting.</p>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Sales summary">
        <article className="metric-card">
          <p className="eyebrow">Lifetime revenue</p>
          <strong>{money(totalRevenue)}</strong>
          <span>{sales.length} sales records</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Last 30 days</p>
          <strong>{money(recentRevenue)}</strong>
          <span>filtered by sold date</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Top category</p>
          <strong>{topSaleCategoryLabel(sales)}</strong>
          <span>by recorded revenue</span>
        </article>
      </section>

      <CreateRecordPanel buttonLabel="Record sale" eyebrow="Revenue" title="Add sale">
        <form className="feed-form" onSubmit={onCreateSale}>
          <label>
            Sold on
            <input name="soldOn" required type="date" defaultValue={dateKeyDaysAgo(0)} />
          </label>
          <label>
            Item type
            <select name="itemType" defaultValue="TABLE_EGGS">
              {saleItemTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input name="quantity" required type="number" min="0.01" step="0.01" />
          </label>
          <label>
            Unit
            <input name="unit" defaultValue="each" placeholder="dozen, chick, lb..." />
          </label>
          <label>
            Unit price
            <input name="unitPrice" required type="number" min="0" step="0.01" />
          </label>
          <label>
            Buyer
            <input name="buyer" placeholder="Optional customer or market" />
          </label>
          <label>
            Coop
            <OptionalCoopSelect coops={coops} />
          </label>
          <label>
            Bird
            <OptionalBirdSelect birds={birds} />
          </label>
          <label>
            Breeding line
            <BreedingLineSelect breedingLines={breedingLines} />
          </label>
          <label>
            Mating period
            <MatingPeriodSelect matingPeriods={matingPeriods} />
          </label>
          <label>
            Incubation
            <OptionalIncubationSelect incubations={incubations} />
          </label>
          <label>
            Hatch batch
            <OptionalHatchBatchSelect hatchBatches={hatchBatches} />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" placeholder="Package count, delivery, payment notes..." />
          </label>
          <button disabled={busy} type="submit">{busy ? "Saving..." : "Save sale"}</button>
        </form>
      </CreateRecordPanel>

      <RecordList title="Recent sales" emptyText="No sales recorded yet.">
        {sales.map((sale) => (
          <article
            className="source-row-card clickable-row"
            key={sale.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedSaleId(sale.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") setSelectedSaleId(sale.id);
            }}
          >
            <div>
              <strong>{formatSaleItemType(sale.item_type)} · {money(sale.total_price)}</strong>
              <span>
                {displayDate(sale.sold_on)} · {numberValue(sale.quantity)} {sale.unit} at {money(sale.unit_price)}
                {sale.buyer ? ` · ${sale.buyer}` : ""}
              </span>
              <span>{sale.breeding_line_name || sale.mating_period_label || sale.hatch_batch_label || sale.coop_name || sale.bird_band || sale.notes || "No linked source"}</span>
            </div>
            <button className="danger" disabled={busy} type="button" onClick={(event) => {
              event.stopPropagation();
              if (confirm("Delete this sale?")) onDeleteSale(sale.id);
            }}>
              Delete
            </button>
          </article>
        ))}
      </RecordList>
    </section>
  );
}

function HealthManager({
  birds,
  busy,
  coops,
  healthEvents,
  photoAttachments,
  onCreateHealthEvent,
  onDeleteHealthEvent,
  onDeletePhoto,
  onCreatePhoto,
  onUpdateHealthEvent
}: {
  birds: Bird[];
  busy: boolean;
  coops: Coop[];
  healthEvents: HealthEvent[];
  photoAttachments: PhotoAttachment[];
  onCreateHealthEvent: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteHealthEvent: (id: string) => void;
  onDeletePhoto: (id: string) => void;
  onCreatePhoto: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateHealthEvent: (id: string, form: HTMLFormElement) => void;
}) {
  const [selectedHealthEventId, setSelectedHealthEventId] = useState<string | null>(null);
  const openEvents = healthEvents.filter((event) => event.outcome !== "RESOLVED");
  const followUpsDue = healthEvents.filter((event) => event.follow_up_on && dateDiffDays(dateKeyDaysAgo(0), event.follow_up_on) != null && (dateDiffDays(dateKeyDaysAgo(0), event.follow_up_on) ?? 0) <= 7 && event.outcome !== "RESOLVED");
  const highSeverity = healthEvents.filter((event) => ["HIGH", "CRITICAL"].includes(event.severity) && event.outcome !== "RESOLVED");
  const selectedHealthEvent = healthEvents.find((event) => event.id === selectedHealthEventId) ?? null;

  if (selectedHealthEvent) {
    return (
      <HealthEventDetail
        birds={birds}
        busy={busy}
        coops={coops}
        event={selectedHealthEvent}
        photoAttachments={photoAttachments}
        onBack={() => setSelectedHealthEventId(null)}
        onDeleteHealthEvent={onDeleteHealthEvent}
        onDeletePhoto={onDeletePhoto}
        onCreatePhoto={onCreatePhoto}
        onUpdateHealthEvent={onUpdateHealthEvent}
      />
    );
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Health</p>
          <h2>Health and behavior records</h2>
          <p className="muted">Track injuries, illness, treatments, aggression, quarantine, mortality, and follow-ups.</p>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Health summary">
        <article className="metric-card">
          <p className="eyebrow">Open issues</p>
          <strong>{openEvents.length}</strong>
          <span>{healthEvents.length} total records</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Follow-ups</p>
          <strong>{followUpsDue.length}</strong>
          <span>due within 7 days or overdue</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">High severity</p>
          <strong>{highSeverity.length}</strong>
          <span>active high or critical issues</span>
        </article>
      </section>

      <CreateRecordPanel buttonLabel="Add health record" eyebrow="Observation" title="Add health or behavior event">
        <form className="feed-form" onSubmit={onCreateHealthEvent}>
          <label>
            Observed on
            <input name="observedOn" required type="date" defaultValue={dateKeyDaysAgo(0)} />
          </label>
          <label>
            Bird
            <OptionalBirdSelect birds={birds} />
          </label>
          <label>
            Coop
            <OptionalCoopSelect coops={coops} />
          </label>
          <label>
            Type
            <select name="eventType" defaultValue="HEALTH">
              {healthEventTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Severity
            <select name="severity" defaultValue="MEDIUM">
              {healthSeverityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Outcome
            <select name="outcome" defaultValue="OPEN">
              {healthOutcomeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input name="title" required placeholder="Limping, bully behavior, respiratory signs..." />
          </label>
          <label>
            Follow-up date
            <input name="followUpOn" type="date" />
          </label>
          <label className="wide-field">
            Treatment
            <input name="treatment" placeholder="Isolation, wound care, medication, observation..." />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" placeholder="Symptoms, behavior, suspected cause, next action..." />
          </label>
          <button disabled={busy} type="submit">{busy ? "Saving..." : "Save health record"}</button>
        </form>
      </CreateRecordPanel>

      <RecordList title="Recent health records" emptyText="No health or behavior records yet.">
        {healthEvents.map((event) => (
          <article
            className="source-row-card clickable-row"
            key={event.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedHealthEventId(event.id)}
            onKeyDown={(keyboardEvent) => {
              if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") setSelectedHealthEventId(event.id);
            }}
          >
            <div>
              <strong>{event.title}</strong>
              <span>
                <span className={`priority-badge ${healthSeverityPriority(event.severity)}`}>{formatHealthSeverity(event.severity)}</span>{" "}
                {formatHealthEventType(event.event_type)} · {formatHealthOutcome(event.outcome)} · {displayDate(event.observed_on)}
              </span>
              <span>{event.bird_band || event.bird_name || event.coop_name || "Whole flock"}{event.follow_up_on ? ` · follow up ${displayDate(event.follow_up_on)}` : ""}</span>
            </div>
            <button className="danger" disabled={busy} type="button" onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              if (confirm("Delete this health record?")) onDeleteHealthEvent(event.id);
            }}>
              Delete
            </button>
          </article>
        ))}
      </RecordList>
    </section>
  );
}

function SaleDetail({
  birds,
  breedingLines,
  busy,
  coops,
  hatchBatches,
  incubations,
  matingPeriods,
  sale,
  onBack,
  onDeleteSale,
  onUpdateSale
}: {
  birds: Bird[];
  breedingLines: BreedingLine[];
  busy: boolean;
  coops: Coop[];
  hatchBatches: HatchBatch[];
  incubations: Incubation[];
  matingPeriods: MatingPeriod[];
  sale: SaleRecord;
  onBack: () => void;
  onDeleteSale: (id: string) => void;
  onUpdateSale: (id: string, form: HTMLFormElement) => void;
}) {
  const sourceLabel =
    sale.breeding_line_name ||
    sale.mating_period_label ||
    sale.hatch_batch_label ||
    sale.incubation_label ||
    sale.coop_name ||
    sale.bird_band ||
    sale.bird_name ||
    "No linked source";

  return (
    <section className="panel detail-page">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Sale detail</p>
          <h2>{formatSaleItemType(sale.item_type)}</h2>
          <p className="muted">
            {displayDate(sale.sold_on)} · {numberValue(sale.quantity)} {sale.unit} at {money(sale.unit_price)}
          </p>
        </div>
        <div className="detail-header-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Back to sales
          </button>
          <button
            className="danger"
            disabled={busy}
            type="button"
            onClick={() => {
              if (confirm("Delete this sale?")) onDeleteSale(sale.id);
            }}
          >
            Delete sale
          </button>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Sale summary">
        <article className="metric-card">
          <p className="eyebrow">Revenue</p>
          <strong>{money(sale.total_price)}</strong>
          <span>{numberValue(sale.quantity)} {sale.unit}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Unit price</p>
          <strong>{money(sale.unit_price)}</strong>
          <span>per {sale.unit || "unit"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Buyer</p>
          <strong className={!sale.buyer ? "metric-soft-value" : ""}>{sale.buyer || "None"}</strong>
          <span>customer or market</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Source</p>
          <strong>{sourceLabel}</strong>
          <span>linked record context</span>
        </article>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Context</p>
            <h3>Linked records</h3>
            <p className="muted compact-copy">{sale.notes || "Linked context for ROI and performance reports."}</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="source-summary record-card-list">
            {[
              ["Bird", sale.bird_band || sale.bird_name || ""],
              ["Coop", sale.coop_name || ""],
              ["Breeding line", sale.breeding_line_name || ""],
              ["Mating period", sale.mating_period_label || ""],
              ["Incubation", sale.incubation_label || ""],
              ["Hatch batch", sale.hatch_batch_label || ""]
            ].map(([label, value]) => (
              <article key={label}>
                <div>
                  <strong>{label}</strong>
                  <span>{value || "Not linked"}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CreateRecordPanel buttonLabel="Edit sale" eyebrow="Record" title="Edit sale">
        <form
          className="feed-form"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateSale(sale.id, event.currentTarget);
          }}
        >
          <label>
            Sold on
            <input name="soldOn" required type="date" defaultValue={normalizeDateKey(sale.sold_on)} />
          </label>
          <label>
            Item type
            <select name="itemType" defaultValue={sale.item_type}>
              {saleItemTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Quantity
            <input name="quantity" required type="number" min="0.01" step="0.01" defaultValue={sale.quantity} />
          </label>
          <label>
            Unit
            <input name="unit" defaultValue={sale.unit} />
          </label>
          <label>
            Unit price
            <input name="unitPrice" required type="number" min="0" step="0.01" defaultValue={sale.unit_price} />
          </label>
          <label>
            Buyer
            <input name="buyer" defaultValue={sale.buyer ?? ""} />
          </label>
          <label>
            Coop
            <OptionalCoopSelect coops={coops} defaultValue={sale.coop_id ?? ""} />
          </label>
          <label>
            Bird
            <OptionalBirdSelect birds={birds} defaultValue={sale.bird_id ?? ""} />
          </label>
          <label>
            Breeding line
            <BreedingLineSelect breedingLines={breedingLines} defaultValue={sale.breeding_line_id ?? ""} />
          </label>
          <label>
            Mating period
            <MatingPeriodSelect matingPeriods={matingPeriods} defaultValue={sale.mating_period_id ?? ""} />
          </label>
          <label>
            Incubation
            <OptionalIncubationSelect incubations={incubations} defaultValue={sale.incubation_id ?? ""} />
          </label>
          <label>
            Hatch batch
            <OptionalHatchBatchSelect hatchBatches={hatchBatches} defaultValue={sale.hatch_batch_id ?? ""} />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" defaultValue={sale.notes ?? ""} />
          </label>
          <div className="row-actions">
            <button disabled={busy} type="submit">{busy ? "Saving..." : "Save sale"}</button>
          </div>
        </form>
      </CreateRecordPanel>
    </section>
  );
}

function HealthEventDetail({
  birds,
  busy,
  coops,
  event,
  photoAttachments,
  onBack,
  onDeleteHealthEvent,
  onDeletePhoto,
  onCreatePhoto,
  onUpdateHealthEvent
}: {
  birds: Bird[];
  busy: boolean;
  coops: Coop[];
  event: HealthEvent;
  photoAttachments: PhotoAttachment[];
  onBack: () => void;
  onDeleteHealthEvent: (id: string) => void;
  onDeletePhoto: (id: string) => void;
  onCreatePhoto: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateHealthEvent: (id: string, form: HTMLFormElement) => void;
}) {
  const followUpDays = event.follow_up_on ? dateDiffDays(dateKeyDaysAgo(0), event.follow_up_on) : null;
  const followUpLabel =
    followUpDays == null
      ? "No follow-up"
      : followUpDays < 0
        ? `${Math.abs(followUpDays)} days overdue`
        : followUpDays === 0
          ? "Due today"
          : `Due in ${followUpDays} days`;

  return (
    <section className="panel detail-page">
      <div className="dashboard-header">
        <div className="detail-title-with-avatar">
          <ProfilePhoto
            busy={busy}
            entityId={event.id}
            entityType="HEALTH_EVENT"
            fallbackText={initials(event.title) || "H"}
            photos={photoAttachments}
            title="Health photo"
            onCreatePhoto={onCreatePhoto}
          />
          <div>
            <p className="eyebrow">Health record</p>
            <h2>{event.title}</h2>
            <p className="muted">
              {formatHealthEventType(event.event_type)} · {displayDate(event.observed_on)} · {event.bird_band || event.bird_name || event.coop_name || "Whole flock"}
            </p>
          </div>
        </div>
        <div className="detail-header-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Back to health
          </button>
          <button
            className="danger"
            disabled={busy}
            type="button"
            onClick={() => {
              if (confirm("Delete this health record?")) onDeleteHealthEvent(event.id);
            }}
          >
            Delete record
          </button>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Health record summary">
        <article className="metric-card">
          <p className="eyebrow">Severity</p>
          <strong>
            <span className={`priority-badge ${healthSeverityPriority(event.severity)}`}>{formatHealthSeverity(event.severity)}</span>
          </strong>
          <span>{formatHealthEventType(event.event_type)}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Outcome</p>
          <strong>{formatHealthOutcome(event.outcome)}</strong>
          <span>{event.outcome === "RESOLVED" ? "closed record" : "active record"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Follow-up</p>
          <strong className={!event.follow_up_on ? "metric-soft-value" : ""}>{event.follow_up_on ? displayDate(event.follow_up_on) : "None"}</strong>
          <span>{followUpLabel}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Subject</p>
          <strong>{event.bird_band || event.bird_name || event.coop_name || "Whole flock"}</strong>
          <span>{event.bird_id ? "bird record" : event.coop_id ? "coop record" : "flock-level record"}</span>
        </article>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Notes</p>
            <h3>Observation and treatment</h3>
            <p className="muted compact-copy">The latest treatment notes and keeper observations for this health record.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="source-summary record-card-list">
            <article>
              <div>
                <strong>Treatment</strong>
                <span>{event.treatment || "No treatment logged"}</span>
              </div>
            </article>
            <article>
              <div>
                <strong>Notes</strong>
                <span>{event.notes || "No notes logged"}</span>
              </div>
            </article>
          </div>
        </div>
      </section>

      <CreateRecordPanel buttonLabel="Edit health record" eyebrow="Record" title="Edit health or behavior record">
        <form
          className="feed-form"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            onUpdateHealthEvent(event.id, submitEvent.currentTarget);
          }}
        >
          <label>
            Observed on
            <input name="observedOn" required type="date" defaultValue={normalizeDateKey(event.observed_on)} />
          </label>
          <label>
            Bird
            <OptionalBirdSelect birds={birds} defaultValue={event.bird_id ?? ""} />
          </label>
          <label>
            Coop
            <OptionalCoopSelect coops={coops} defaultValue={event.coop_id ?? ""} />
          </label>
          <label>
            Type
            <select name="eventType" defaultValue={event.event_type}>
              {healthEventTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Severity
            <select name="severity" defaultValue={event.severity}>
              {healthSeverityOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Outcome
            <select name="outcome" defaultValue={event.outcome}>
              {healthOutcomeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Title
            <input name="title" required defaultValue={event.title} />
          </label>
          <label>
            Follow-up date
            <input name="followUpOn" type="date" defaultValue={normalizeDateKey(event.follow_up_on)} />
          </label>
          <label className="wide-field">
            Treatment
            <input name="treatment" defaultValue={event.treatment ?? ""} />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" defaultValue={event.notes ?? ""} />
          </label>
          <div className="row-actions">
            <button disabled={busy} type="submit">{busy ? "Saving..." : "Save health record"}</button>
          </div>
        </form>
      </CreateRecordPanel>
    </section>
  );
}

function ReportsManager({
  birds,
  breedingLines,
  coops,
  eggLogs,
  feedTypes,
  feedLogs,
  hatchBatches,
  healthEvents,
  homestead,
  incubations,
  matingPeriods,
  sales
}: {
  birds: Bird[];
  breedingLines: BreedingLine[];
  coops: Coop[];
  eggLogs: EggLog[];
  feedTypes: FeedType[];
  feedLogs: FeedLog[];
  hatchBatches: HatchBatch[];
  healthEvents: HealthEvent[];
  homestead: Homestead;
  incubations: Incubation[];
  matingPeriods: MatingPeriod[];
  sales: SaleRecord[];
}) {
  const [reportKind, setReportKind] = useState<ReportKind>("eggs");
  const [fromDate, setFromDate] = useState(dateKeyAddDays(dateKeyDaysAgo(0), -30));
  const [toDate, setToDate] = useState(dateKeyDaysAgo(0));
  const [coopId, setCoopId] = useState("all");
  const [breedingLineId, setBreedingLineId] = useState("all");
  const [status, setStatus] = useState("all");
  const tableEggValue = preferenceNumber(homestead, "valueTableEgg", 0.35);
  const meatValuePerOz = preferenceNumber(homestead, "valueMeatPerOz", 0.5);

  const inRange = (value: string | null | undefined) => {
    const key = normalizeDateKey(value);
    if (!key) return false;
    return (!fromDate || key >= fromDate) && (!toDate || key <= toDate);
  };
  const overlapsRange = (startValue: string | null | undefined, endValue: string | null | undefined) => {
    const start = normalizeDateKey(startValue);
    const end = normalizeDateKey(endValue) || toDate || dateKeyDaysAgo(0);
    if (!start) return false;
    return (!fromDate || end >= fromDate) && (!toDate || start <= toDate);
  };
  const matchesCoop = (id: string | null | undefined) => coopId === "all" || id === coopId;
  const matchesLine = (id: string | null | undefined) => breedingLineId === "all" || id === breedingLineId;
  const filteredEggLogs = eggLogs.filter((log) => inRange(log.logged_on) && matchesCoop(log.coop_id) && matchesLine(log.breeding_line_id));
  const filteredFeedLogs = feedLogs.filter((log) => inRange(log.logged_at) && matchesCoop(log.coop_id));
  const filteredSales = sales.filter((sale) => inRange(sale.sold_on) && matchesCoop(sale.coop_id) && matchesLine(sale.breeding_line_id));
  const filteredHealthEvents = healthEvents.filter((event) => inRange(event.observed_on) && matchesCoop(event.coop_id));
  const filteredIncubations = incubations.filter((cycle) => inRange(cycle.set_date) && matchesLine(matingPeriods.find((period) => period.id === cycle.mating_period_id)?.breeding_line_id ?? null));
  const filteredMatingPeriods = matingPeriods.filter((period) => overlapsRange(period.started_on, period.ended_on) && matchesCoop(period.coop_id) && matchesLine(period.breeding_line_id));
  const filteredBirds = birds.filter((bird) => {
    const hatchBatch = hatchBatches.find((batch) => batch.id === bird.hatch_batch_id);
    const lineId = bird.breeding_line_id ?? hatchBatch?.breeding_line_id ?? null;
    const matchesDate =
      inRange(bird.hatch_date) ||
      inRange(bird.processed_date) ||
      (!normalizeDateKey(bird.hatch_date) && !normalizeDateKey(bird.processed_date));
    return matchesDate && (status === "all" || bird.status === status) && matchesCoop(bird.coop_id) && matchesLine(lineId);
  });
  const eggQuantity = filteredEggLogs.reduce((sum, log) => sum + numberValue(log.quantity), 0);
  const feedCost = filteredFeedLogs.reduce((sum, log) => sum + numberValue(log.cost), 0);
  const salesRevenue = filteredSales.reduce((sum, sale) => sum + numberValue(sale.total_price), 0);
  const eggValue = filteredEggLogs.reduce((sum, log) => sum + eggLogValue(log, tableEggValue), 0);
  const incubationEggs = filteredIncubations.reduce((sum, cycle) => sum + numberValue(cycle.eggs_set), 0);
  const incubationHatched = filteredIncubations.reduce((sum, cycle) => sum + numberValue(cycle.hatched_count), 0);
  const dataQualityRows = [
    ...birds
      .filter((bird) => !bird.hatch_date)
      .map((bird) => ({ Area: "Birds", Record: birdLabel(bird), Issue: "Missing hatch date", Severity: "Medium", Action: "Add hatch date to enable age-based growth and reminders." })),
    ...birds
      .filter((bird) => bird.status === "ACTIVE" && !bird.coop_id)
      .map((bird) => ({ Area: "Birds", Record: birdLabel(bird), Issue: "Active bird has no coop", Severity: "High", Action: "Assign a coop so feed cost and group context calculate correctly." })),
    ...incubations
      .filter((cycle) => cycle.hatched_count == null && dateDiffDays(cycle.expected_hatch_date, dateKeyDaysAgo(0)) != null && (dateDiffDays(cycle.expected_hatch_date, dateKeyDaysAgo(0)) ?? 0) > 2)
      .map((cycle) => ({ Area: "Incubation", Record: cycle.label, Issue: "Past expected hatch with no hatch result", Severity: "High", Action: "Enter hatched count to create/confirm hatch batch." })),
    ...matingPeriods
      .filter((period) => !period.sire_id || !numberValue(period.hen_count))
      .map((period) => ({ Area: "Breeding", Record: period.label, Issue: "Incomplete mating period lineage", Severity: "Medium", Action: "Link sire and hen group for better offspring attribution." })),
    ...feedTypes
      .filter((feed) => !numberValue(feed.cup_weight_oz) || !numberValue(feed.bag_weight_lb) || !numberValue(feed.bag_cost))
      .map((feed) => ({ Area: "Feed", Record: feedTypeLabel(feed), Issue: "Missing feed conversion/cost data", Severity: "Medium", Action: "Add bag weight, bag cost, and cup weight." })),
    ...healthEvents
      .filter((event) => event.outcome !== "RESOLVED" && event.follow_up_on && dateDiffDays(dateKeyDaysAgo(0), event.follow_up_on) != null && (dateDiffDays(dateKeyDaysAgo(0), event.follow_up_on) ?? 0) < 0)
      .map((event) => ({ Area: "Health", Record: event.title, Issue: "Follow-up overdue", Severity: event.severity === "CRITICAL" || event.severity === "HIGH" ? "High" : "Medium", Action: "Review health/behavior follow-up." }))
  ];

  const birdRows = filteredBirds.map((bird) => {
    const hatchBatch = hatchBatches.find((batch) => batch.id === bird.hatch_batch_id);
    const birdEggLogs = eggLogs.filter((log) => log.bird_id === bird.id);
    const birdEggValue = birdEggLogs.reduce((sum, log) => sum + eggLogValue(log, tableEggValue), 0);
    const birdSalesRevenue = sales
      .filter((sale) => sale.bird_id === bird.id)
      .reduce((sum, sale) => sum + numberValue(sale.total_price), 0);
    const birdFeedCost = estimatedBirdFeedCost(bird, feedLogs);
    const meatValue = ["PROCESSED", "CULLED"].includes(bird.status) && bird.current_weight_oz ? numberValue(bird.current_weight_oz) * meatValuePerOz : 0;
    const trackedReturn = birdEggValue + meatValue + birdSalesRevenue;

    return {
      Bird: birdLabel(bird),
      Sex: formatBirdSex(bird.sex),
      Status: formatBirdStatus(bird.status),
      Coop: bird.coop_name || "",
      Line: bird.breeding_line_name || hatchBatch?.breeding_line_name || "",
      "Hatch date": displayDate(bird.hatch_date, ""),
      Age: ageLabelFromDays(ageDaysOn(bird.hatch_date, dateKeyDaysAgo(0))),
      "Egg value": money(birdEggValue),
      "Meat value": money(meatValue),
      "Sales revenue": money(birdSalesRevenue),
      "Feed cost": money(birdFeedCost),
      "Net value": money(trackedReturn - birdFeedCost)
    };
  });

  const reportRows: Array<Record<string, string | number>> =
    reportKind === "eggs"
      ? filteredEggLogs.map((log) => ({
          Date: displayDate(log.logged_on),
          Source: eggSourceLabel(log),
          Coop: log.coop_name || "",
          Line: log.breeding_line_name || "",
          Period: log.mating_period_label || "",
          Eggs: numberValue(log.quantity),
          Value: money(eggLogValue(log, tableEggValue)),
          Notes: log.notes || ""
        }))
      : reportKind === "feed"
        ? filteredFeedLogs.map((log) => ({
            Date: displayDate(log.logged_at),
            Coop: log.coop_name,
            Feed: `${log.feed_brand} ${log.feed_name}`,
            Amount: `${numberValue(log.amount)} ${feedUnitLabel(log.unit, numberValue(log.amount))}`,
            Pounds: numberValue(log.amount_lb).toFixed(2),
            Cost: money(log.cost),
            "Active birds": numberValue(log.active_bird_count),
            "Cost / bird": numberValue(log.active_bird_count) ? money(numberValue(log.cost) / numberValue(log.active_bird_count)) : "",
            Notes: log.notes || ""
          }))
        : reportKind === "sales"
          ? filteredSales.map((sale) => ({
              Date: displayDate(sale.sold_on),
              Type: formatSaleItemType(sale.item_type),
              Quantity: numberValue(sale.quantity),
              Unit: sale.unit,
              "Unit price": money(sale.unit_price),
              Revenue: money(sale.total_price),
              Buyer: sale.buyer || "",
              Source: sale.breeding_line_name || sale.mating_period_label || sale.hatch_batch_label || sale.coop_name || sale.bird_band || "",
              Notes: sale.notes || ""
            }))
        : reportKind === "incubation"
          ? filteredIncubations.map((cycle) => ({
              Cycle: cycle.label,
              Line: cycle.breeding_line_name || "",
              Period: cycle.mating_period_label || "",
              "Set date": displayDate(cycle.set_date),
              "Expected hatch": displayDate(cycle.expected_hatch_date),
              "Eggs set": numberValue(cycle.eggs_set),
              Fertile: cycle.fertile_eggs == null ? "" : numberValue(cycle.fertile_eggs),
              Hatched: cycle.hatched_count == null ? "" : numberValue(cycle.hatched_count),
              Fertility: rateLabel(fertileRate(cycle.eggs_set, cycle.fertile_eggs)),
              "Hatch rate": rateLabel(fertileRate(cycle.eggs_set, cycle.hatched_count)),
              "Hatch batch": cycle.hatch_batch_id ? "Created" : ""
            }))
          : reportKind === "breeding"
            ? filteredMatingPeriods.map((period) => ({
                Line: period.breeding_line_name,
                Period: period.label,
                Coop: period.coop_name || "",
                Sire: period.sire_label || "",
                Hens: numberValue(period.hen_count),
                Started: displayDate(period.started_on),
                Ended: displayDate(period.ended_on, "Active"),
                Incubations: numberValue(period.incubation_count),
                "Eggs set": numberValue(period.eggs_set),
                Fertile: numberValue(period.fertile_eggs),
                Hatched: numberValue(period.hatched_count),
                Fertility: rateLabel(fertileRate(period.eggs_set, period.fertile_eggs)),
                "Hatch rate": rateLabel(fertileRate(period.eggs_set, period.hatched_count))
              }))
            : reportKind === "health"
              ? filteredHealthEvents.map((event) => ({
                  Date: displayDate(event.observed_on),
                  Type: formatHealthEventType(event.event_type),
                  Severity: formatHealthSeverity(event.severity),
                  Outcome: formatHealthOutcome(event.outcome),
                  Title: event.title,
                  Bird: event.bird_band || event.bird_name || "",
                  Coop: event.coop_name || "",
                  "Follow-up": displayDate(event.follow_up_on, ""),
                  Treatment: event.treatment || "",
                  Notes: event.notes || ""
                }))
              : reportKind === "dataQuality"
                ? dataQualityRows
                : birdRows;
  const reportLabel = {
    eggs: "Egg production",
    feed: "Feed cost",
    sales: "Sales and revenue",
    incubation: "Incubation performance",
    breeding: "Breeding performance",
    birdValue: "Bird value",
    health: "Health and behavior",
    dataQuality: "Data quality"
  }[reportKind];
  const reportHeaders = reportRows[0] ? Object.keys(reportRows[0]) : [];

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Performance reports</h2>
          <p className="muted">Filter reports, compare performance, and export the current view to CSV.</p>
        </div>
        <button
          className="secondary"
          disabled={!reportRows.length}
          type="button"
          onClick={() => downloadCsv(`covey-${reportKind}-report-${dateKeyDaysAgo(0)}.csv`, reportRows)}
        >
          Export CSV
        </button>
      </div>

      <section className="metric-grid embedded" aria-label="Report summary">
        <article className="metric-card">
          <p className="eyebrow">Report</p>
          <strong>{reportLabel}</strong>
          <span>{reportRows.length} rows in current view</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Egg value</p>
          <strong>{money(eggValue)}</strong>
          <span>{eggQuantity} eggs collected</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Revenue</p>
          <strong>{money(salesRevenue)}</strong>
          <span>{filteredSales.length} sales in range</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Net cash</p>
          <strong>{money(salesRevenue + eggValue - feedCost)}</strong>
          <span>revenue plus egg value minus feed</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Hatch rate</p>
          <strong>{rateLabel(incubationEggs ? (incubationHatched / incubationEggs) * 100 : null)}</strong>
          <span>{incubationHatched} hatched from {incubationEggs} eggs set</span>
        </article>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Current view</p>
            <h3>{reportLabel}</h3>
            <p className="muted compact-copy">{reportRows.length} rows match the current filters.</p>
          </div>
        </div>
        <div className="table-card">
          <div className="table-control-panel">
            <div className="report-controls">
              <label>
                Report type
                <select value={reportKind} onChange={(event) => setReportKind(event.target.value as ReportKind)}>
                  <option value="eggs">Egg production</option>
                  <option value="feed">Feed cost</option>
                  <option value="sales">Sales and revenue</option>
                  <option value="incubation">Incubation performance</option>
                  <option value="breeding">Breeding performance</option>
                  <option value="birdValue">Bird value</option>
                  <option value="health">Health and behavior</option>
                  <option value="dataQuality">Data quality</option>
                </select>
              </label>
              <label>
                From
                <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              </label>
              <label>
                To
                <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              </label>
              <label>
                Coop
                <select value={coopId} onChange={(event) => setCoopId(event.target.value)}>
                  <option value="all">All coops</option>
                  {coops.map((coop) => (
                    <option key={coop.id} value={coop.id}>{coop.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Breeding line
                <select value={breedingLineId} onChange={(event) => setBreedingLineId(event.target.value)}>
                  <option value="all">All lines</option>
                  {breedingLines.map((line) => (
                    <option key={line.id} value={line.id}>{line.name}</option>
                  ))}
                </select>
              </label>
              {reportKind === "birdValue" ? (
                <label>
                  Bird status
                  <select value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="all">All statuses</option>
                    {birdStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </div>
          {reportRows.length ? (
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    {reportHeaders.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row, index) => (
                    <tr key={index}>
                      {reportHeaders.map((header) => (
                        <td key={header}>{row[header]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No report rows</h3>
              <p>Try widening the date range or clearing coop and breeding-line filters.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted"
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function formatAuditEntity(entityType: string) {
  return entityType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function auditSummary(event: AuditEvent) {
  const method = typeof event.metadata.method === "string" ? event.metadata.method : "";
  const path = typeof event.metadata.path === "string" ? event.metadata.path : "";
  const id = event.entity_id ? ` · ${event.entity_id.slice(0, 8)}` : "";
  return `${method} ${path}${id}`;
}

function AuditManager({
  auditEvents,
  managedUsers,
  onRefresh
}: {
  auditEvents: AuditEvent[];
  managedUsers: ManagedUser[];
  onRefresh: () => Promise<void>;
}) {
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const entityTypes = Array.from(new Set(auditEvents.map((event) => event.entity_type))).sort();
  const actions = Array.from(new Set(auditEvents.map((event) => event.action))).sort();
  const filteredEvents = auditEvents.filter((event) => {
    const matchesAction = actionFilter === "all" || event.action === actionFilter;
    const matchesEntity = entityFilter === "all" || event.entity_type === entityFilter;
    const matchesUser = userFilter === "all" || event.user_id === userFilter;
    return matchesAction && matchesEntity && matchesUser;
  });

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">History</p>
          <h2>Audit history</h2>
          <p className="muted">
            Review successful create, update, and delete actions across the homestead.
          </p>
        </div>
        <button className="secondary" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Events</p>
            <h3>History log</h3>
            <p className="muted compact-copy">{filteredEvents.length} of {auditEvents.length} events shown.</p>
          </div>
        </div>
        <div className="table-card card-list-table">
          <div className="table-control-panel">
            <div className="filter-grid">
              <label>
                Action
                <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
                  <option value="all">All actions</option>
                  {actions.map((action) => (
                    <option key={action} value={action}>{formatAuditAction(action)}</option>
                  ))}
                </select>
              </label>
              <label>
                Record type
                <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
                  <option value="all">All record types</option>
                  {entityTypes.map((entityType) => (
                    <option key={entityType} value={entityType}>{formatAuditEntity(entityType)}</option>
                  ))}
                </select>
              </label>
              <label>
                User
                <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
                  <option value="all">All users</option>
                  {managedUsers.map((managedUser) => (
                    <option key={managedUser.id} value={managedUser.id}>{managedUser.display_name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {filteredEvents.length ? (
            <div className="audit-list">
              {filteredEvents.map((event) => (
                <article className={`audit-card action-${event.action}`} key={event.id}>
                  <div>
                    <span className={`status-chip ${event.action === "delete" ? "culled" : event.action === "update" ? "processed" : "active"}`}>
                      {formatAuditAction(event.action)}
                    </span>
                    <strong>{formatAuditEntity(event.entity_type)}</strong>
                    <p>{auditSummary(event)}</p>
                  </div>
                  <div className="audit-meta">
                    <b>{event.user_display_name || event.user_email || "Unknown user"}</b>
                    <span>{formatDateTime(event.created_at)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No history matches those filters</h3>
              <p>New successful changes will appear here automatically.</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

const birdColumnDefs: Array<{
  key: BirdColumnKey;
  label: string;
  value: (bird: Bird, feedLogs: FeedLog[]) => string | number;
  render: (bird: Bird, feedLogs: FeedLog[]) => string;
}> = [
  { key: "sex", label: "Sex", value: (bird) => bird.sex, render: (bird) => formatBirdSex(bird.sex) },
  {
    key: "status",
    label: "Status",
    value: (bird) => bird.status,
    render: (bird) => formatBirdStatus(bird.status)
  },
  { key: "coop", label: "Coop", value: (bird) => bird.coop_name ?? "", render: (bird) => bird.coop_name || "No coop" },
  {
    key: "hatchDate",
    label: "Hatch date",
    value: (bird) => normalizeDateKey(bird.hatch_date),
    render: (bird) => displayDate(bird.hatch_date, "Not recorded")
  },
  {
    key: "age",
    label: "Age",
    value: (bird) => ageDaysOn(bird.hatch_date, dateKeyDaysAgo(0)) ?? -1,
    render: (bird) => ageLabelFromDays(ageDaysOn(bird.hatch_date, dateKeyDaysAgo(0)))
  },
  {
    key: "processedDate",
    label: "Processed date",
    value: (bird) => normalizeDateKey(bird.processed_date),
    render: (bird) => displayDate(bird.processed_date, "Not processed")
  },
  {
    key: "weight",
    label: "Weight",
    value: (bird) => Number(bird.current_weight_oz ?? 0),
    render: (bird) => (bird.current_weight_oz ? `${bird.current_weight_oz} oz` : "No weight")
  },
  {
    key: "feedCost",
    label: "Lifetime feed est.",
    value: (bird, feedLogs) => estimatedBirdFeedCost(bird, feedLogs),
    render: (bird, feedLogs) => money(estimatedBirdFeedCost(bird, feedLogs))
  },
  { key: "notes", label: "Notes", value: (bird) => bird.notes ?? "", render: (bird) => bird.notes || "No notes" }
];

function compareValues(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function CoopManager({
  birds = [],
  busy,
  coops,
  feedLogs = [],
  onCreateCoop,
  onDeleteCoop,
  onBulkDeleteCoops,
  onBulkUpdateCoops,
  onUpdateCoop
}: {
  birds?: Bird[];
  busy: boolean;
  coops: Coop[];
  feedLogs?: FeedLog[];
  onCreateCoop: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteCoop: (id: string) => void;
  onBulkDeleteCoops?: (ids: string[]) => Promise<void>;
  onBulkUpdateCoops?: (ids: string[], patch: Partial<Pick<Coop, "type" | "capacity">>) => Promise<void>;
  onUpdateCoop: (id: string, form: HTMLFormElement) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCoopId, setSelectedCoopId] = useState<string | null>(null);
  const [selectedCoopIds, setSelectedCoopIds] = useState<string[]>([]);
  const [bulkCoopEditing, setBulkCoopEditing] = useState(false);
  const [bulkCoopType, setBulkCoopType] = useState<CoopType | "NO_CHANGE">("NO_CHANGE");
  const [bulkCoopCapacity, setBulkCoopCapacity] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [cameraFilter, setCameraFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: CoopSortKey; dir: SortDirection }>({ key: "name", dir: "asc" });
  const selectedCoop = coops.find((coop) => coop.id === selectedCoopId) ?? null;
  const filteredCoops = coops.filter((coop) => {
    const matchesType = typeFilter === "all" || coop.type === typeFilter;
    const matchesCamera =
      cameraFilter === "all" || (cameraFilter === "camera" ? coop.has_camera : !coop.has_camera);
    return matchesType && matchesCamera;
  });
  const sortedCoops = [...filteredCoops].sort((a, b) => {
    const value = (coop: Coop) => {
      if (sort.key === "name") return coop.name;
      if (sort.key === "type") return formatCoopType(coop.type);
      if (sort.key === "capacity") return coop.capacity ?? 0;
      return numberValue(coop.active_bird_count);
    };
    return compareValues(value(a), value(b)) * (sort.dir === "asc" ? 1 : -1);
  });
  const coopGridTemplateColumns = "44px minmax(240px, 1.35fr) 130px 130px 130px 86px";
  const visibleCoopIds = sortedCoops.map((coop) => coop.id);
  const visibleCoopIdSet = new Set(visibleCoopIds);
  const allVisibleCoopsSelected =
    visibleCoopIds.length > 0 && visibleCoopIds.every((id) => selectedCoopIds.includes(id));

  function toggleCoopSelection(id: string) {
    setSelectedCoopIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
    setBulkCoopEditing(false);
  }

  function toggleVisibleCoops(checked: boolean) {
    setSelectedCoopIds((current) => {
      if (!checked) return current.filter((id) => !visibleCoopIdSet.has(id));
      return Array.from(new Set([...current, ...visibleCoopIds]));
    });
    setBulkCoopEditing(false);
  }

  async function applyBulkCoopEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onBulkUpdateCoops || !selectedCoopIds.length) return;
    const patch: Partial<Pick<Coop, "type" | "capacity">> = {};
    if (bulkCoopType !== "NO_CHANGE") patch.type = bulkCoopType;
    if (bulkCoopCapacity.trim()) patch.capacity = Number(bulkCoopCapacity);
    if (!Object.keys(patch).length) return;
    await onBulkUpdateCoops(selectedCoopIds, patch);
    setSelectedCoopIds([]);
    setBulkCoopEditing(false);
    setBulkCoopType("NO_CHANGE");
    setBulkCoopCapacity("");
  }

  async function applyBulkCoopDelete() {
    if (!onBulkDeleteCoops || !selectedCoopIds.length) return;
    if (!confirm(`Delete ${selectedCoopIds.length} selected ${selectedCoopIds.length === 1 ? "coop" : "coops"}?`)) return;
    await onBulkDeleteCoops(selectedCoopIds);
    setSelectedCoopIds([]);
  }

  function toggleSort(key: CoopSortKey) {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "asc" ? "desc" : "asc"
    }));
  }

  function sortLabel(key: CoopSortKey, label: string) {
    return `${label}${sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}`;
  }

  if (selectedCoop) {
    return (
      <CoopDetail
        birds={birds}
        busy={busy}
        coop={selectedCoop}
        feedLogs={feedLogs}
        onBack={() => setSelectedCoopId(null)}
        onDeleteCoop={onDeleteCoop}
        onUpdateCoop={onUpdateCoop}
      />
    );
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Coops</p>
          <h2>Manage housing</h2>
          <p className="muted">
            {filteredCoops.length} shown · {coops.length} total. Coops anchor birds, feed logs, egg logs, and breeding groups, so they are the first real
            management screen in the new app.
          </p>
        </div>
      </div>

      <CreateRecordPanel
        buttonLabel="Add coop"
        eyebrow="New coop"
        title="Add housing"
        description="Create a coop, pen, brooder, or grow-out space when you add physical housing."
      >
        <form className="settings-grid" onSubmit={onCreateCoop}>
          <label>
            Coop name
            <input name="name" required placeholder="Breeding Pen 1" />
          </label>
          <label>
            Type
            <CoopTypeSelect />
          </label>
          <label>
            Capacity
            <input name="capacity" type="number" min="1" placeholder="5" />
          </label>
          <label className="wide-field">
            Camera RTSP URL
            <input name="cameraRtspUrl" placeholder="rtsp://camera.local/stream1" />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" placeholder="Line A, north rack, etc." />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Saving..." : "Add coop"}
          </button>
        </form>
      </CreateRecordPanel>

      <div className="table-card">
        {coops.length ? (
          <div className="coop-list">
            <div className="table-control-panel">
              <div className="flock-tools table-tools">
                <div className="list-filters" aria-label="Coop filters">
                  <label>
                    Type
                    <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                      <option value="all">All types</option>
                      {coopTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Camera
                    <select value={cameraFilter} onChange={(event) => setCameraFilter(event.target.value)}>
                      <option value="all">All coops</option>
                      <option value="camera">Camera enabled</option>
                      <option value="no-camera">No camera</option>
                    </select>
                  </label>
                </div>
                {onBulkUpdateCoops || onBulkDeleteCoops ? (
                  <div className="bulk-actions" aria-label="Bulk coop actions">
                    <span>
                      {selectedCoopIds.length > 1
                        ? `${selectedCoopIds.length} selected`
                        : selectedCoopIds.length === 1
                          ? "Select one more for bulk actions"
                          : "Select rows for bulk actions"}
                    </span>
                    {selectedCoopIds.length > 1 ? (
                      <>
                        <button
                          className="secondary"
                          disabled={busy || !onBulkUpdateCoops}
                          type="button"
                          onClick={() => setBulkCoopEditing((current) => !current)}
                        >
                          Edit
                        </button>
                        <button
                          className="danger"
                          disabled={busy || !onBulkDeleteCoops}
                          type="button"
                          onClick={applyBulkCoopDelete}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {bulkCoopEditing && selectedCoopIds.length > 1 ? (
                <form className="bulk-edit-form" onSubmit={applyBulkCoopEdit}>
                  <div>
                    <p className="eyebrow">Bulk edit</p>
                    <strong>Update {selectedCoopIds.length} selected coops</strong>
                    <span>Fields left as no change will be skipped.</span>
                  </div>
                  <label>
                    Type
                    <select
                      value={bulkCoopType}
                      onChange={(event) => setBulkCoopType(event.target.value as CoopType | "NO_CHANGE")}
                    >
                      <option value="NO_CHANGE">No change</option>
                      {coopTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Capacity
                    <input
                      min="1"
                      placeholder="No change"
                      type="number"
                      value={bulkCoopCapacity}
                      onChange={(event) => setBulkCoopCapacity(event.target.value)}
                    />
                  </label>
                  <div className="row-actions">
                    <button
                      disabled={busy || (bulkCoopType === "NO_CHANGE" && !bulkCoopCapacity.trim())}
                      type="submit"
                    >
                      Apply changes
                    </button>
                    <button className="secondary" disabled={busy} type="button" onClick={() => setBulkCoopEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
            <div className="coop-row coop-table-head" style={{ gridTemplateColumns: coopGridTemplateColumns }}>
              <label className="table-select-cell" aria-label="Select visible coops">
                <input
                  checked={allVisibleCoopsSelected}
                  type="checkbox"
                  onChange={(event) => toggleVisibleCoops(event.target.checked)}
                />
              </label>
              <button className="sort-button" type="button" onClick={() => toggleSort("name")}>
                {sortLabel("name", "Coop")}
              </button>
              <button className="sort-button" type="button" onClick={() => toggleSort("type")}>
                {sortLabel("type", "Type")}
              </button>
              <button className="sort-button" type="button" onClick={() => toggleSort("capacity")}>
                {sortLabel("capacity", "Capacity")}
              </button>
              <button className="sort-button" type="button" onClick={() => toggleSort("birds")}>
                {sortLabel("birds", "Birds")}
              </button>
              <span />
            </div>
            {sortedCoops.length ? sortedCoops.map((coop) =>
              editingId === coop.id ? (
                <form
                  className="coop-row edit-row"
                  key={coop.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    onUpdateCoop(coop.id, event.currentTarget);
                    setEditingId(null);
                  }}
                >
                  <label>
                    Coop name
                    <input name="name" required defaultValue={coop.name} />
                  </label>
                  <label>
                    Type
                    <CoopTypeSelect defaultValue={coop.type} />
                  </label>
                  <label>
                    Capacity
                    <input name="capacity" type="number" min="1" defaultValue={coop.capacity ?? ""} />
                  </label>
                  <label>
                    Camera RTSP URL
                    <input
                      name="cameraRtspUrl"
                      placeholder={coop.has_camera ? "Saved; leave blank to keep current" : "rtsp://camera.local/stream1"}
                    />
                  </label>
                  {coop.has_camera ? (
                    <label className="check-row">
                      <input name="clearCameraRtspUrl" type="checkbox" />
                      Clear saved camera URL
                    </label>
                  ) : null}
                  <label>
                    Notes
                    <input name="notes" defaultValue={coop.notes ?? ""} />
                  </label>
                  <div className="row-actions">
                    <button disabled={busy} type="submit">
                      Save
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      type="button"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  className="coop-row clickable-row"
                  key={coop.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCoopId(coop.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedCoopId(coop.id);
                  }}
                  style={{ gridTemplateColumns: coopGridTemplateColumns }}
                >
                  <label className="table-select-cell" aria-label={`Select ${coop.name}`} onClick={(event) => event.stopPropagation()}>
                    <input
                      checked={selectedCoopIds.includes(coop.id)}
                      type="checkbox"
                      onChange={() => toggleCoopSelection(coop.id)}
                    />
                  </label>
	                  <div>
	                    <strong>
                        {coop.name}
                        {coop.has_camera ? <span className="camera-name-badge" title="Camera enabled"><span className="camera-icon" /></span> : null}
                      </strong>
	                    <p>{coop.notes || "No notes yet."}</p>
	                  </div>
                  <span>
                    <span className={`status-chip ${coop.type.toLowerCase()}`}>{formatCoopType(coop.type)}</span>
                  </span>
                  <span>{coop.capacity ? `${coop.capacity} birds` : "No capacity"}</span>
	                  <span>{numberValue(coop.active_bird_count)} active / {numberValue(coop.bird_count)} total</span>
	                  <span className="row-open-hint">Open details</span>
                </div>
              )
            ) : (
              <div className="empty-state">
                <h3>No coops match these filters</h3>
                <p>Adjust the type or camera filter to widen the list.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No coops yet</h3>
            <p>Add your first breeding, grow-out, brooder, or hospital coop above.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CoopDetail({
  birds,
  busy,
  coop,
  feedLogs,
  onBack,
  onDeleteCoop,
  onUpdateCoop
}: {
  birds: Bird[];
  busy: boolean;
  coop: Coop;
  feedLogs: FeedLog[];
  onBack: () => void;
  onDeleteCoop: (id: string) => void;
  onUpdateCoop: (id: string, form: HTMLFormElement) => void;
}) {
  const coopBirds = birds.filter((bird) => bird.coop_id === coop.id);
  const activeBirds = coopBirds.filter((bird) => bird.status === "ACTIVE");
  const coopFeedCost = feedLogs
    .filter((log) => log.coop_id === coop.id)
    .reduce((total, log) => total + numberValue(log.cost), 0);

  return (
    <section className="panel detail-page">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Coop detail</p>
          <h2>{coop.name}</h2>
          <p className="muted">
            <span className={`status-chip ${coop.type.toLowerCase()}`}>{formatCoopType(coop.type)}</span> · {activeBirds.length} active birds · {coop.capacity ? `${coop.capacity} capacity` : "no capacity set"}
          </p>
        </div>
        <div className="detail-header-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Back to coops
          </button>
          <button
            className="danger"
            disabled={busy}
            type="button"
            onClick={() => {
              if (confirm(`Delete ${coop.name}?`)) {
                onDeleteCoop(coop.id);
                onBack();
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Coop detail summary">
        <article className="metric-card">
          <p className="eyebrow">Birds</p>
          <strong>{activeBirds.length}</strong>
          <span>{coopBirds.length} total assigned</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Capacity</p>
          <strong>{coop.capacity ?? "None"}</strong>
          <span>{coop.capacity ? `${Math.max(0, coop.capacity - activeBirds.length)} spaces open` : "not configured"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Feed cost</p>
          <strong>{money(coopFeedCost)}</strong>
          <span>{activeBirds.length ? `${money(coopFeedCost / activeBirds.length)} / active bird` : "no active birds"}</span>
        </article>
      </section>

      {coop.has_camera ? (
        <section className="subpanel table-section">
          <div className="table-section-header">
            <div>
              <p className="eyebrow">Camera</p>
              <h3>Live view</h3>
              <p className="muted compact-copy">Saved camera stream for this coop.</p>
            </div>
          </div>
          <div className="table-card camera-detail-card">
            <CameraViewer coop={coop} />
          </div>
        </section>
      ) : null}

      <CreateRecordPanel buttonLabel="Edit coop" eyebrow="Record" title="Edit coop">
        <form
          className="settings-grid"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateCoop(coop.id, event.currentTarget);
          }}
        >
          <label>
            Coop name
            <input name="name" required defaultValue={coop.name} />
          </label>
          <label>
            Type
            <CoopTypeSelect defaultValue={coop.type} />
          </label>
          <label>
            Capacity
            <input name="capacity" type="number" min="1" defaultValue={coop.capacity ?? ""} />
          </label>
          <label>
            Camera RTSP URL
            <input name="cameraRtspUrl" placeholder={coop.has_camera ? "Saved; leave blank to keep current" : "rtsp://camera.local/stream1"} />
          </label>
          {coop.has_camera ? (
            <label className="check-row">
              <input name="clearCameraRtspUrl" type="checkbox" />
              Clear saved camera URL
            </label>
          ) : null}
          <label className="wide-field">
            Notes
            <input name="notes" defaultValue={coop.notes ?? ""} />
          </label>
          <div className="row-actions">
            <button disabled={busy} type="submit">Save coop</button>
          </div>
        </form>
      </CreateRecordPanel>
    </section>
  );
}

function CameraOverview({ coops, onNavigate }: { coops: Coop[]; onNavigate: (section: DashboardSection) => void }) {
  const cameraCoops = coops.filter((coop) => coop.has_camera);
  const cameraAreaRef = useRef<HTMLDivElement | null>(null);
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>(() => cameraCoops.map((coop) => coop.id));
  const [gridPreset, setGridPreset] = useState<CameraGridPreset>("2");
  const visibleCameraCoops = cameraCoops.filter((coop) => selectedCameraIds.includes(coop.id));

  useEffect(() => {
    setSelectedCameraIds((current) => {
      const availableIds = new Set(cameraCoops.map((coop) => coop.id));
      const kept = current.filter((id) => availableIds.has(id));
      return kept.length || !cameraCoops.length ? kept : cameraCoops.map((coop) => coop.id);
    });
  }, [cameraCoops.map((coop) => coop.id).join("|")]);

  function toggleCamera(coopId: string) {
    setSelectedCameraIds((current) =>
      current.includes(coopId) ? current.filter((id) => id !== coopId) : [...current, coopId]
    );
  }

  async function toggleFullscreen() {
    const element = cameraAreaRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await element.requestFullscreen();
    }
  }

  return (
    <section className="detail-page">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Cameras</p>
          <h2>Live coop views</h2>
          <p className="muted compact-copy">
            Multi-view uses the same saved coop camera streams as each coop detail page.
          </p>
        </div>
        <button type="button" onClick={() => onNavigate("coops")}>
          Manage coops
        </button>
      </div>

      {cameraCoops.length ? (
        <div className="camera-overview" ref={cameraAreaRef}>
          <section className="subpanel camera-controls">
            <div>
              <p className="eyebrow">View controls</p>
              <h3>{visibleCameraCoops.length} selected</h3>
            </div>
            <div className="camera-control-row">
              <label>
                Grid
                <select value={gridPreset} onChange={(event) => setGridPreset(event.target.value as CameraGridPreset)}>
                  <option value="auto">Auto fit</option>
                  <option value="2">2 columns</option>
                  <option value="4">4 columns</option>
                </select>
              </label>
              <button type="button" onClick={() => setSelectedCameraIds(cameraCoops.map((coop) => coop.id))}>
                Select all
              </button>
              <button className="secondary" type="button" onClick={() => setSelectedCameraIds([])}>
                Clear
              </button>
              <button className="secondary" type="button" onClick={toggleFullscreen}>
                Fullscreen
              </button>
            </div>
            <div className="camera-selector-list" aria-label="Camera selection">
              {cameraCoops.map((coop) => (
                <label className="check-row" key={coop.id}>
                  <input
                    checked={selectedCameraIds.includes(coop.id)}
                    type="checkbox"
                    onChange={() => toggleCamera(coop.id)}
                  />
                  {coop.name}
                </label>
              ))}
            </div>
          </section>

          {visibleCameraCoops.length ? (
            <div className={`camera-overview-grid grid-${gridPreset}`}>
              {visibleCameraCoops.map((coop) => (
                <article className="camera-card" key={coop.id}>
                  <div className="camera-card-header">
                    <div>
                      <p className="eyebrow">Coop camera</p>
                      <h3>{coop.name}</h3>
                    </div>
                    <span className="camera-icon" title="Camera enabled" />
                  </div>
                  <CameraViewer coop={coop} showCaption={false} showToolbar={false} />
                </article>
              ))}
            </div>
          ) : (
            <section className="subpanel">
              <p className="eyebrow">Nothing selected</p>
              <h3>Select cameras to start live view</h3>
              <p className="muted">This keeps unused streams from loading until you want them visible.</p>
            </section>
          )}
        </div>
      ) : (
        <section className="subpanel">
          <p className="eyebrow">No cameras yet</p>
          <h3>Add RTSP URLs on coops</h3>
          <p className="muted">
            Once a coop has a saved camera URL, it will show up here automatically.
          </p>
          <button type="button" onClick={() => onNavigate("coops")}>
            Go to coops
          </button>
        </section>
      )}
    </section>
  );
}

function CameraViewer({
  coop,
  showCaption = true,
  showToolbar = true
}: {
  coop: Coop;
  showCaption?: boolean;
  showToolbar?: boolean;
}) {
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [health, setHealth] = useState<CameraHealth | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [size, setSize] = useState<CameraPlayerSize>("compact");
  const [selectedPlaybackMode, setSelectedPlaybackMode] = useState<CameraPlaybackMode | null>(null);
  const activePlaybackMode = selectedPlaybackMode ?? status?.playbackMode ?? "auto";
  const playerUrl =
    activePlaybackMode === "mjpeg"
      ? null
      : status?.playerUrls?.[activePlaybackMode] ?? status?.playerUrl ?? null;
  const playbackLabel = playbackLabelFor(activePlaybackMode);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setStatus(null);
    setHealth(null);
    setErrorMessage("");
    setSelectedPlaybackMode(null);

    apiRequest<{ camera: CameraStatus }>(`/coops/${coop.id}/camera/status`)
      .then((result) => {
        if (!cancelled) setStatus(result.camera);
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Camera stream is not available.");
          setState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [coop.id]);

  async function checkHealth() {
    setCheckingHealth(true);
    setHealth(null);
    setErrorMessage("");
    try {
      const result = await apiRequest<{ health: CameraHealth }>(`/coops/${coop.id}/camera/health`);
      setHealth(result.health);
    } catch (error) {
      setHealth({
        ok: false,
        streamRegistered: false,
        mjpegAvailable: false,
        message: error instanceof Error ? error.message : "Camera health check failed."
      });
    } finally {
      setCheckingHealth(false);
    }
  }

  return (
    <>
      {showToolbar ? (
        <div className="camera-toolbar">
          <span>Player size</span>
          {(["compact", "standard", "large"] as const).map((option) => (
            <button
              className={size === option ? "active" : ""}
              key={option}
              type="button"
              onClick={() => setSize(option)}
            >
              {option}
            </button>
          ))}
          <button className="secondary" disabled={checkingHealth} type="button" onClick={checkHealth}>
            {checkingHealth ? "Checking..." : "Check health"}
          </button>
          <details className="advanced-playback">
            <summary>Advanced playback</summary>
            <div>
              {(["mse", "auto", "webrtc", "mjpeg"] as const).map((option) => (
                <button
                  className={activePlaybackMode === option ? "active" : ""}
                  key={option}
                  type="button"
                  onClick={() => {
                    setState("loading");
                    setSelectedPlaybackMode(option);
                  }}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </details>
        </div>
      ) : null}
      <div className={`camera-frame camera-${size} ${state === "error" ? "camera-frame-error" : ""}`}>
        {playerUrl ? (
          <iframe
            title={`${coop.name} live camera`}
            src={playerUrl}
            onLoad={() => setState("ready")}
          />
        ) : status ? (
          <img
            alt={`${coop.name} live camera`}
            src={`${apiUrl}${status.mjpegUrl}`}
            onLoad={() => setState("ready")}
            onError={() => setState("error")}
          />
        ) : null}
        {state !== "ready" ? (
          <div className="camera-status">
            <strong>{state === "error" ? "Camera stream unavailable" : "Connecting to camera..."}</strong>
            <span>
              {state === "error"
                ? errorMessage || "Covey could not load the MJPEG stream. Check the RTSP URL, camera credentials, and go2rtc logs."
                : activePlaybackMode === "webrtc"
                  ? "Opening the WebRTC player through go2rtc."
                  : "Opening the proxied stream through go2rtc."}
            </span>
          </div>
        ) : null}
      </div>
      {status ? (
        <div className="camera-meta">
          <span>Playback: {playbackLabel}</span>
          <span>Stream: {status.health}</span>
          {activePlaybackMode === "webrtc" ? <span>Transport: WebRTC selected</span> : null}
          {activePlaybackMode === "mse" ? <span>Transport: MSE selected</span> : null}
          {activePlaybackMode === "auto" ? <span>Transport chosen inside go2rtc</span> : null}
        </div>
      ) : null}
      {health ? (
        <div className={`camera-health ${health.ok ? "ok" : "warn"}`}>
          <strong>{health.ok ? "Health check complete" : "Health check needs attention"}</strong>
          <span>{health.message}</span>
          <small>
            go2rtc registered: {health.streamRegistered ? "yes" : "no"} · MJPEG fallback:{" "}
            {health.mjpegAvailable ? "available" : "unavailable"}
            {health.preferredPlayback ? ` · Preferred: ${health.preferredPlayback.toUpperCase()}` : ""}
          </small>
          {health.streamInfo ? (
            <small>
              Video: {health.streamInfo.videoCodecs.length ? health.streamInfo.videoCodecs.join(", ") : "unknown"} ·
              Audio: {health.streamInfo.audioCodecs.length ? ` ${health.streamInfo.audioCodecs.join(", ")}` : " unknown"} ·
              WebRTC candidate: {health.webrtcCandidate ?? "not configured"}
              {health.webrtcListen ? ` · Listen: ${health.webrtcListen}` : ""}
            </small>
          ) : null}
          {health.mjpegSource ? <small>MJPEG source: {health.mjpegSource}</small> : null}
          {health.diagnostics?.length ? (
            <ul className="camera-diagnostics">
              {health.diagnostics.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {showCaption ? (
        <p className="muted compact-copy">
          {activePlaybackMode === "mjpeg"
            ? "Covey is using its signed-in MJPEG fallback for this stream."
            : activePlaybackMode === "webrtc"
              ? "Covey is asking go2rtc for WebRTC playback with a Docker-friendly ICE candidate; MSE and MJPEG remain available."
              : activePlaybackMode === "mse"
                ? "Covey is using go2rtc's MSE browser player, which is the best fit for this camera so far."
                : "Covey is letting go2rtc choose the browser playback mode for this stream."}
          {status?.mjpegUrl ? (
            <>
              {" "}
              <a href={`${apiUrl}${status.mjpegUrl}`} target="_blank" rel="noreferrer">
                Open MJPEG fallback
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}

function playbackLabelFor(mode: CameraPlaybackMode) {
  if (mode === "webrtc") return "WebRTC via go2rtc";
  if (mode === "mse") return "MSE via go2rtc";
  if (mode === "auto") return "go2rtc auto";
  return "MJPEG fallback";
}

function BirdManager({
  birds,
  busy,
  coops,
  eggLogs = [],
  feedLogs = [],
  hatchBatches = [],
  homestead,
  matingPeriods = [],
  photoAttachments = [],
  recordTarget,
  weightLogs = [],
  onCreateBird,
  onCreateWeightLog,
  onDeleteBird,
  onDeletePhoto,
  onDeleteWeightLog,
  onBulkDeleteBirds,
  onBulkUpdateBirds,
  onCreatePhoto,
  onOpenRecord,
  onRecordTargetHandled,
  onUpdateBird
}: {
  birds: Bird[];
  busy: boolean;
  coops: Coop[];
  eggLogs?: EggLog[];
  feedLogs?: FeedLog[];
  hatchBatches?: HatchBatch[];
  homestead?: Homestead;
  matingPeriods?: MatingPeriod[];
  photoAttachments?: PhotoAttachment[];
  recordTarget?: RecordTarget | null;
  weightLogs?: WeightLog[];
  onCreateBird: (event: FormEvent<HTMLFormElement>) => void;
  onCreateWeightLog?: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteBird: (id: string) => void;
  onDeletePhoto?: (id: string) => void;
  onDeleteWeightLog?: (id: string) => void;
  onBulkDeleteBirds?: (ids: string[]) => Promise<void>;
  onBulkUpdateBirds?: (ids: string[], patch: Partial<Pick<Bird, "status">> & { coopId?: string | null }) => Promise<void>;
  onCreatePhoto?: (event: FormEvent<HTMLFormElement>) => void;
  onOpenRecord?: (target: RecordTarget) => void;
  onRecordTargetHandled?: () => void;
  onUpdateBird: (id: string, form: HTMLFormElement) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedBirdId, setSelectedBirdId] = useState<string | null>(null);
  const [selectedBirdIds, setSelectedBirdIds] = useState<string[]>([]);
  const [bulkBirdEditing, setBulkBirdEditing] = useState(false);
  const [bulkBirdStatus, setBulkBirdStatus] = useState<BirdStatus | "NO_CHANGE">("NO_CHANGE");
  const [bulkBirdCoopId, setBulkBirdCoopId] = useState<string>("NO_CHANGE");
  const defaultBirdView = String(homestead?.preferences.defaultBirdView ?? "active");
  const [statusFilter, setStatusFilter] = useState<string>(
    defaultBirdView === "inactive" ? "inactive" : defaultBirdView === "all" ? "all" : "ACTIVE"
  );
  const [sexFilter, setSexFilter] = useState<string>("all");
  const [coopFilter, setCoopFilter] = useState<string>("all");

  useEffect(() => {
    setStatusFilter(defaultBirdView === "inactive" ? "inactive" : defaultBirdView === "all" ? "all" : "ACTIVE");
  }, [defaultBirdView]);

  useEffect(() => {
    if (recordTarget?.type !== "bird") return;
    setSelectedBirdId(recordTarget.id);
    onRecordTargetHandled?.();
  }, [onRecordTargetHandled, recordTarget]);

  const activeCount = birds.filter((bird) => bird.status === "ACTIVE").length;
  const selectedBird = birds.find((bird) => bird.id === selectedBirdId) ?? null;
  const [visibleColumns, setVisibleColumns] = useState<BirdColumnKey[]>(() => {
    const fallback: BirdColumnKey[] = ["sex", "status", "coop", "age", "weight"];
    try {
      const saved = JSON.parse(localStorage.getItem("coveyFlockColumns") ?? "[]") as BirdColumnKey[];
      const valid = saved.filter((column) => birdColumnDefs.some((definition) => definition.key === column));
      return valid.length ? valid : fallback;
    } catch {
      return fallback;
    }
  });
  const [sort, setSort] = useState<{ key: BirdSortKey; dir: SortDirection }>({ key: "bird", dir: "asc" });
  const selectedColumnSet = new Set(visibleColumns);
  const columns = birdColumnDefs.filter((column) => selectedColumnSet.has(column.key));
  const gridTemplateColumns = `44px minmax(210px, 1.35fr) repeat(${columns.length}, minmax(128px, 1fr)) 150px`;
  const filteredBirds = birds.filter((bird) => {
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "inactive" ? bird.status !== "ACTIVE" : bird.status === statusFilter);
    const matchesSex = sexFilter === "all" || bird.sex === sexFilter;
    const matchesCoop = coopFilter === "all" || (coopFilter === "none" ? !bird.coop_id : bird.coop_id === coopFilter);
    return matchesStatus && matchesSex && matchesCoop;
  });
  const sortedBirds = [...filteredBirds].sort((a, b) => {
    const getValue = (bird: Bird) => {
      if (sort.key === "bird") return bird.band || bird.name || "Unbanded bird";
      return birdColumnDefs.find((column) => column.key === sort.key)?.value(bird, feedLogs) ?? "";
    };
    return compareValues(getValue(a), getValue(b)) * (sort.dir === "asc" ? 1 : -1);
  });
  const visibleBirdIds = sortedBirds.map((bird) => bird.id);
  const visibleBirdIdSet = new Set(visibleBirdIds);
  const allVisibleBirdsSelected =
    visibleBirdIds.length > 0 && visibleBirdIds.every((id) => selectedBirdIds.includes(id));

  useEffect(() => {
    localStorage.setItem("coveyFlockColumns", JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  function toggleBirdSelection(id: string) {
    setSelectedBirdIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id]
    );
    setBulkBirdEditing(false);
  }

  function toggleVisibleBirds(checked: boolean) {
    setSelectedBirdIds((current) => {
      if (!checked) return current.filter((id) => !visibleBirdIdSet.has(id));
      return Array.from(new Set([...current, ...visibleBirdIds]));
    });
    setBulkBirdEditing(false);
  }

  async function applyBulkBirdEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onBulkUpdateBirds || !selectedBirdIds.length) return;
    const patch: Partial<Pick<Bird, "status">> & { coopId?: string | null } = {};
    if (bulkBirdStatus !== "NO_CHANGE") patch.status = bulkBirdStatus;
    if (bulkBirdCoopId !== "NO_CHANGE") patch.coopId = bulkBirdCoopId === "none" ? null : bulkBirdCoopId;
    if (!Object.keys(patch).length) return;
    await onBulkUpdateBirds(selectedBirdIds, patch);
    setSelectedBirdIds([]);
    setBulkBirdEditing(false);
    setBulkBirdStatus("NO_CHANGE");
    setBulkBirdCoopId("NO_CHANGE");
  }

  async function applyBulkBirdDelete() {
    if (!onBulkDeleteBirds || !selectedBirdIds.length) return;
    if (!confirm(`Delete ${selectedBirdIds.length} selected ${selectedBirdIds.length === 1 ? "bird" : "birds"}?`)) return;
    await onBulkDeleteBirds(selectedBirdIds);
    setSelectedBirdIds([]);
  }

  function toggleSort(key: BirdSortKey) {
    setSort((current) => ({
      key,
      dir: current.key === key && current.dir === "asc" ? "desc" : "asc"
    }));
  }

  function toggleColumn(key: BirdColumnKey) {
    setVisibleColumns((current) =>
      current.includes(key) ? current.filter((column) => column !== key) : [...current, key]
    );
  }

  function sortLabel(key: BirdSortKey, label: string) {
    return `${label}${sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}`;
  }

  if (selectedBird) {
    return (
      <BirdDetail
        bird={selectedBird}
        birds={birds}
        busy={busy}
        coops={coops}
        eggLogs={eggLogs}
        feedLogs={feedLogs}
        hatchBatches={hatchBatches}
        homestead={homestead}
        matingPeriods={matingPeriods}
        photoAttachments={photoAttachments}
        weightLogs={weightLogs}
        onBack={() => setSelectedBirdId(null)}
        onCreateWeightLog={onCreateWeightLog}
        onDeleteBird={onDeleteBird}
        onDeletePhoto={onDeletePhoto}
        onDeleteWeightLog={onDeleteWeightLog}
        onCreatePhoto={onCreatePhoto}
        onOpenRecord={onOpenRecord}
        onUpdateBird={onUpdateBird}
      />
    );
  }

  return (
    <section className="panel">
      <div className="dashboard-header">
        <div>
          <p className="eyebrow">Flock</p>
          <h2>Bird records</h2>
          <p className="muted">
            {filteredBirds.length} shown · {birds.length} total birds · {activeCount} active. Names are optional; bands can be
            reused once a prior bird is inactive.
          </p>
        </div>
      </div>

      <CreateRecordPanel
        buttonLabel="Add bird"
        eyebrow="New bird"
        title="Add bird record"
        description="Names are optional. Bands must be unique among active birds, case-insensitively."
      >
        <form className="bird-form" onSubmit={onCreateBird}>
          <label>
            Name, optional
            <input name="name" placeholder="Optional nickname" />
          </label>
          <label>
            Band
            <input name="band" placeholder="purple-3" />
          </label>
          <label>
            Sex
            <BirdSexSelect />
          </label>
          <label>
            Status
            <BirdStatusSelect />
          </label>
          <label>
            Coop
            <CoopSelect coops={coops} />
          </label>
          <label>
            Hatch date
            <input name="hatchDate" type="date" />
          </label>
          <label>
            Processed date
            <input name="processedDate" type="date" />
          </label>
          <label>
            Weight, oz
            <input name="currentWeightOz" type="number" min="0.1" step="0.1" />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" placeholder="Temperament, health, breeding notes, etc." />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Saving..." : "Add bird"}
          </button>
        </form>
      </CreateRecordPanel>

      <div className="table-card">
        {birds.length ? (
          <>
            <div className="table-control-panel">
              <div className="flock-tools table-tools">
                <div className="list-filters" aria-label="Flock filters">
                  <label>
                    Status
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">All records</option>
                      <option value="inactive">Inactive records</option>
                      {birdStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Sex
                    <select value={sexFilter} onChange={(event) => setSexFilter(event.target.value)}>
                      <option value="all">All sexes</option>
                      {birdSexOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Coop
                    <select value={coopFilter} onChange={(event) => setCoopFilter(event.target.value)}>
                      <option value="all">All coops</option>
                      <option value="none">No coop</option>
                      {coops.map((coop) => (
                        <option key={coop.id} value={coop.id}>
                          {coop.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <details className="column-picker">
                  <summary>Columns</summary>
                  <div className="column-options">
                    {birdColumnDefs.map((column) => (
                      <label className="check-row" key={column.key}>
                        <input
                          checked={selectedColumnSet.has(column.key)}
                          onChange={() => toggleColumn(column.key)}
                          type="checkbox"
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                </details>
                {onBulkUpdateBirds || onBulkDeleteBirds ? (
                  <div className="bulk-actions" aria-label="Bulk bird actions">
                    <span>
                      {selectedBirdIds.length > 1
                        ? `${selectedBirdIds.length} selected`
                        : selectedBirdIds.length === 1
                          ? "Select one more for bulk actions"
                          : "Select rows for bulk actions"}
                    </span>
                    {selectedBirdIds.length > 1 ? (
                      <>
                        <button
                          className="secondary"
                          disabled={busy || !onBulkUpdateBirds}
                          type="button"
                          onClick={() => setBulkBirdEditing((current) => !current)}
                        >
                          Edit
                        </button>
                        <button
                          className="danger"
                          disabled={busy || !onBulkDeleteBirds}
                          type="button"
                          onClick={applyBulkBirdDelete}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {bulkBirdEditing && selectedBirdIds.length > 1 ? (
                <form className="bulk-edit-form" onSubmit={applyBulkBirdEdit}>
                  <div>
                    <p className="eyebrow">Bulk edit</p>
                    <strong>Update {selectedBirdIds.length} selected birds</strong>
                    <span>Fields left as no change will be skipped.</span>
                  </div>
                  <label>
                    Status
                    <select
                      value={bulkBirdStatus}
                      onChange={(event) => setBulkBirdStatus(event.target.value as BirdStatus | "NO_CHANGE")}
                    >
                      <option value="NO_CHANGE">No change</option>
                      {birdStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Coop
                    <select
                      value={bulkBirdCoopId}
                      onChange={(event) => setBulkBirdCoopId(event.target.value)}
                    >
                      <option value="NO_CHANGE">No change</option>
                      <option value="none">No coop</option>
                      {coops.map((coop) => (
                        <option key={coop.id} value={coop.id}>
                          {coop.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="row-actions">
                    <button
                      disabled={busy || (bulkBirdStatus === "NO_CHANGE" && bulkBirdCoopId === "NO_CHANGE")}
                      type="submit"
                    >
                      Apply changes
                    </button>
                    <button className="secondary" disabled={busy} type="button" onClick={() => setBulkBirdEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
            <div className="bird-list">
              <div className="bird-row bird-table-head" style={{ gridTemplateColumns }}>
                <label className="table-select-cell" aria-label="Select visible birds">
                  <input
                    checked={allVisibleBirdsSelected}
                    type="checkbox"
                    onChange={(event) => toggleVisibleBirds(event.target.checked)}
                  />
                </label>
                <button className="sort-button" type="button" onClick={() => toggleSort("bird")}>
                  {sortLabel("bird", "Bird")}
                </button>
                {columns.map((column) => (
                  <button
                    className="sort-button"
                    key={column.key}
                    type="button"
                    onClick={() => toggleSort(column.key)}
                  >
                    {sortLabel(column.key, column.label)}
                  </button>
                ))}
                <span />
              </div>
              {sortedBirds.length ? (
                sortedBirds.map((bird) =>
                  editingId === bird.id ? (
                    <form
                      className="bird-row edit-bird-row"
                      key={bird.id}
                      onSubmit={(event) => {
                        event.preventDefault();
                        onUpdateBird(bird.id, event.currentTarget);
                        setEditingId(null);
                      }}
                    >
                      <label>
                        Name
                        <input name="name" defaultValue={bird.name ?? ""} />
                      </label>
                      <label>
                        Band
                        <input name="band" defaultValue={bird.band ?? ""} />
                      </label>
                      <label>
                        Sex
                        <BirdSexSelect defaultValue={bird.sex} />
                      </label>
                      <label>
                        Status
                        <BirdStatusSelect defaultValue={bird.status} />
                      </label>
                      <label>
                        Coop
                        <CoopSelect coops={coops} defaultValue={bird.coop_id ?? ""} />
                      </label>
                      <label>
                        Hatch date
                        <input name="hatchDate" type="date" defaultValue={normalizeDateKey(bird.hatch_date)} />
                      </label>
                      <label>
                        Processed date
                        <input name="processedDate" type="date" defaultValue={normalizeDateKey(bird.processed_date)} />
                      </label>
                      <label>
                        Weight, oz
                        <input
                          name="currentWeightOz"
                          type="number"
                          min="0.1"
                          step="0.1"
                          defaultValue={bird.current_weight_oz ?? ""}
                        />
                      </label>
                      <label>
                        Notes
                        <input name="notes" defaultValue={bird.notes ?? ""} />
                      </label>
                      <div className="row-actions">
                        <button disabled={busy} type="submit">
                          Save
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          type="button"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div
                      className="bird-row clickable-row"
                      key={bird.id}
                      role="button"
                      tabIndex={0}
                      style={{ gridTemplateColumns }}
                      onClick={() => setSelectedBirdId(bird.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setSelectedBirdId(bird.id);
                      }}
                    >
                      <label className="table-select-cell" aria-label={`Select ${birdLabel(bird)}`} onClick={(event) => event.stopPropagation()}>
                        <input
                          checked={selectedBirdIds.includes(bird.id)}
                          type="checkbox"
                          onChange={() => toggleBirdSelection(bird.id)}
                        />
                      </label>
                      <div>
                        <strong>{bird.band || bird.name || "Unbanded bird"}</strong>
                        <p>{bird.name && bird.band ? bird.name : bird.notes || "No notes yet."}</p>
                      </div>
                      {columns.map((column) =>
                        column.key === "status" ? (
                          <span className={`status-chip ${bird.status.toLowerCase()}`} key={column.key}>
                            {column.render(bird, feedLogs)}
                          </span>
                        ) : (
                          <span key={column.key}>{column.render(bird, feedLogs)}</span>
                        )
                      )}
                      <span className="row-open-hint">Open</span>
                    </div>
                  )
                )
              ) : (
                <div className="empty-state">
                  <h3>No birds match these filters</h3>
                  <p>Adjust the status, sex, or coop filter to widen the list.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h3>No birds yet</h3>
            <p>Add birds here after creating at least one coop.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function BirdDetail({
  bird,
  birds,
  busy,
  coops,
  eggLogs,
  feedLogs,
  hatchBatches,
  homestead,
  matingPeriods,
  photoAttachments,
  weightLogs,
  onBack,
  onCreatePhoto,
  onCreateWeightLog,
  onDeleteBird,
  onDeletePhoto,
  onDeleteWeightLog,
  onOpenRecord,
  onUpdateBird
}: {
  bird: Bird;
  birds: Bird[];
  busy: boolean;
  coops: Coop[];
  eggLogs: EggLog[];
  feedLogs: FeedLog[];
  hatchBatches: HatchBatch[];
  homestead?: Homestead;
  matingPeriods: MatingPeriod[];
  photoAttachments: PhotoAttachment[];
  weightLogs?: WeightLog[];
  onBack: () => void;
  onCreatePhoto?: (event: FormEvent<HTMLFormElement>) => void;
  onCreateWeightLog?: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteBird: (id: string) => void;
  onDeletePhoto?: (id: string) => void;
  onDeleteWeightLog?: (id: string) => void;
  onOpenRecord?: (target: RecordTarget) => void;
  onUpdateBird: (id: string, form: HTMLFormElement) => void;
}) {
  const feedCost = estimatedBirdFeedCost(bird, feedLogs);
  const tableEggValue = homestead ? preferenceNumber(homestead, "valueTableEgg", 0.35) : 0.35;
  const meatValuePerOz = homestead ? preferenceNumber(homestead, "valueMeatPerOz", 0.5) : 0.5;
  const roiStrongReturn = homestead ? preferenceNumber(homestead, "roiStrongReturn", 10) : 10;
  const roiPositiveReturn = homestead ? preferenceNumber(homestead, "roiPositiveReturn", 0) : 0;
  const currentAgeDays = ageDaysOn(bird.hatch_date, dateKeyDaysAgo(0));
  const birdEggLogs = eggLogs.filter((log) => log.bird_id === bird.id);
  const eggValue = birdEggLogs.reduce((total, log) => total + eggLogValue(log, tableEggValue), 0);
  const meatValue =
    ["PROCESSED", "CULLED"].includes(bird.status) && bird.current_weight_oz
      ? numberValue(bird.current_weight_oz) * meatValuePerOz
      : 0;
  const trackedReturn = eggValue + meatValue;
  const netValue = trackedReturn - feedCost;
  const rating = valueRating(netValue, roiStrongReturn, roiPositiveReturn);
  const maxValueBar = Math.max(1, eggValue, meatValue, feedCost);
  const hatchBatch = hatchBatches.find((batch) => batch.id === bird.hatch_batch_id) ?? null;
  const breedingLineId = hatchBatch?.breeding_line_id ?? bird.breeding_line_id;
  const breedingLineName = bird.breeding_line_name || hatchBatch?.breeding_line_name || "Unknown";
  const matingPeriod = hatchBatch
    ? matingPeriods.find((period) => period.id === hatchBatch.mating_period_id) ?? null
    : null;
  const henLabels = matingPeriod?.hens.map((hen) => hen.label).join(", ") || "Unknown hen group";
  const sireBird = matingPeriod?.sire_id ? birds.find((candidate) => candidate.id === matingPeriod.sire_id) ?? null : null;
  const henBirds = matingPeriod?.hens.map((hen) => birds.find((candidate) => candidate.id === hen.id) ?? null).filter((hen): hen is Bird => Boolean(hen)) ?? [];
  const birdWeightLogs = [...(weightLogs ?? [])]
    .filter((log) => log.bird_id === bird.id)
    .sort((a, b) => (dateDiffDays(a.weighed_on, b.weighed_on) ?? 0));
  const latestWeightLog = birdWeightLogs.at(-1) ?? null;
  const maxWeight = Math.max(1, ...birdWeightLogs.map((log) => numberValue(log.weight_oz)));
  const growthPoints = birdWeightLogs.map((log) => ({
    ...log,
    ageDays: ageDaysOn(bird.hatch_date, log.weighed_on)
  }));
  const cohortBirds = birds
    .filter((candidate) => {
      if (bird.hatch_batch_id) return candidate.hatch_batch_id === bird.hatch_batch_id;
      if (bird.hatch_date) return normalizeDateKey(candidate.hatch_date) === normalizeDateKey(bird.hatch_date);
      return false;
    })
    .sort((a, b) => compareValues(birdLabel(a), birdLabel(b)));
  const cohortBirdIds = new Set(cohortBirds.map((candidate) => candidate.id));
  const cohortLogsByAge: CohortWeightLog[] = [];

  for (const log of weightLogs ?? []) {
    if (!cohortBirdIds.has(log.bird_id)) continue;

    const cohortBird = cohortBirds.find((candidate) => candidate.id === log.bird_id);
    const ageDays = ageDaysOn(cohortBird?.hatch_date ?? null, log.weighed_on);
    if (!cohortBird || ageDays == null) continue;

    cohortLogsByAge.push({
      ...log,
      bird: cohortBird,
      ageDays
    });
  }

  cohortLogsByAge.sort((a, b) => a.ageDays - b.ageDays);
  const cohortAgeBuckets = Array.from(
    cohortLogsByAge.reduce<
      Map<
        number,
        {
          ageDays: number;
          logs: CohortWeightLog[];
        }
      >
    >((buckets, log) => {
      const ageDays = log.ageDays;
      const bucket = buckets.get(ageDays) ?? { ageDays, logs: [] };
      bucket.logs.push(log);
      buckets.set(ageDays, bucket);
      return buckets;
    }, new Map()).values()
  ).sort((a, b) => a.ageDays - b.ageDays);
  const cohortMaxWeight = Math.max(
    1,
    ...cohortAgeBuckets.map((bucket) => Math.max(...bucket.logs.map((log) => numberValue(log.weight_oz))))
  );
  const cohortLabel = bird.hatch_batch_label
    ? `hatch batch ${bird.hatch_batch_label}`
    : bird.hatch_date
      ? `hatch date ${displayDate(bird.hatch_date)}`
      : "this cohort";

  return (
    <section className="panel detail-page">
      <div className="dashboard-header">
        <div className="detail-title-with-avatar">
          {onCreatePhoto ? (
            <ProfilePhoto
              busy={busy}
              entityId={bird.id}
              entityType="BIRD"
              fallbackText={initials(birdLabel(bird)) || "B"}
              photos={photoAttachments}
              title="Bird photo"
              onCreatePhoto={onCreatePhoto}
            />
          ) : null}
          <div>
            <p className="eyebrow">Bird detail</p>
            <h2>{bird.band || bird.name || "Unbanded bird"}</h2>
            <p className="muted">
              {formatBirdSex(bird.sex)} · {formatBirdStatus(bird.status)} · {bird.coop_name || "No coop"}
            </p>
          </div>
        </div>
        <div className="detail-header-actions">
          <button className="secondary" type="button" onClick={onBack}>
            Back to flock
          </button>
          <button
            className="danger"
            disabled={busy}
            type="button"
            onClick={() => {
              if (confirm("Delete this bird record?")) {
                onDeleteBird(bird.id);
                onBack();
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <section className="metric-grid embedded" aria-label="Bird detail summary">
        <article className="metric-card">
          <p className="eyebrow">Status</p>
          <strong>
            <span className={`status-chip ${bird.status.toLowerCase()}`}>{formatBirdStatus(bird.status)}</span>
          </strong>
          <span>{bird.processed_date ? `processed ${displayDate(bird.processed_date)}` : "current record"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Age</p>
          <strong className={!bird.hatch_date ? "metric-soft-value" : ""}>{ageLabelFromDays(currentAgeDays)}</strong>
          <span>{bird.hatch_date ? `hatched ${displayDate(bird.hatch_date)}` : "hatch date unknown"}</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Weight</p>
          <strong>{bird.current_weight_oz ? `${bird.current_weight_oz} oz` : "None"}</strong>
          <span>latest recorded weight</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Feed estimate</p>
          <strong>{money(feedCost)}</strong>
          <span>based on coop top-offs</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Tracked return</p>
          <strong>{money(trackedReturn)}</strong>
          <span>eggs plus realized meat value</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Net estimate</p>
          <strong>{money(netValue)}</strong>
          <span>tracked return minus feed estimate</span>
        </article>
        <article className="metric-card">
          <p className="eyebrow">Value rating</p>
          <strong>
            <span className={`value-rating ${rating.tone}`}>{rating.label}</span>
          </strong>
          <span>{rating.detail}</span>
        </article>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Economics</p>
            <h3>Tracked value breakdown</h3>
            <p className="muted compact-copy">
              Bars compare each category against the largest category in this breakdown. They are not goals or targets.
            </p>
          </div>
        </div>
        <div className="table-card value-card">
          <div className="value-chart" aria-label="Bird lifetime value chart">
            {[
              { label: "Egg value", value: eggValue, tone: "positive" },
              { label: "Realized meat value", value: meatValue, tone: "positive" },
              { label: "Feed cost", value: feedCost, tone: "cost" }
            ].map((item) => (
              <article key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{money(item.value)}</span>
                </div>
                <div className="value-bar-track">
                  <div
                    className={`value-bar-fill ${item.tone}`}
                    style={{ width: `${Math.max(3, (item.value / maxValueBar) * 100)}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
          <p className="muted compact-copy">
            Egg value only includes egg logs tied directly to this bird. Meat value is a one-time realized value after processing or culling, not an ongoing LTV stream.
          </p>
        </div>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Growth</p>
            <h3>Weight history by age</h3>
            <p className="muted compact-copy">Weight logs are plotted by age from hatch date, not calendar date.</p>
          </div>
        </div>
        <div className="table-card value-card">
          {growthPoints.length ? (
            <div className="growth-chart" aria-label="Bird weight history chart">
              {growthPoints.map((log) => (
                <article key={log.id}>
                  <span>{ageLabelFromDays(log.ageDays)}</span>
                  <div className="growth-bar-track">
                    <div
                      className="growth-bar-fill"
                      style={{ width: `${Math.max(4, (numberValue(log.weight_oz) / maxWeight) * 100)}%` }}
                    />
                  </div>
                  <strong>{numberValue(log.weight_oz).toFixed(1)} oz</strong>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No weight history yet</h3>
              <p>Add a weigh-in below to start the growth curve.</p>
            </div>
          )}
        </div>
      </section>

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Cohort comparison</p>
            <h3>Growth against hatch mates</h3>
            <p className="muted compact-copy">
              Comparing {cohortBirds.length} birds from {cohortLabel}. Points are grouped by age.
            </p>
          </div>
        </div>
        <div className="table-card value-card">
          {cohortAgeBuckets.length && cohortBirds.length > 1 ? (
            <div className="cohort-chart" aria-label="Cohort weight comparison chart">
              {cohortAgeBuckets.map((bucket) => {
                const ownLog = bucket.logs.find((log) => log.bird_id === bird.id);
                const average =
                  bucket.logs.reduce((sum, log) => sum + numberValue(log.weight_oz), 0) / bucket.logs.length;
                const topWeight = Math.max(...bucket.logs.map((log) => numberValue(log.weight_oz)));
                const topLog = bucket.logs.find((log) => numberValue(log.weight_oz) === topWeight);

                return (
                  <article key={bucket.ageDays}>
                    <div>
                      <strong>{ageLabelFromDays(bucket.ageDays)}</strong>
                      <span>
                        {bucket.logs.length} records · avg {average.toFixed(1)} oz
                        {topLog?.bird ? ` · top ${birdLabel(topLog.bird)} ${topWeight.toFixed(1)} oz` : ""}
                      </span>
                    </div>
                    <div className="cohort-bars">
                      <div className="cohort-bar-row">
                        <span>This bird</span>
                        <div className="growth-bar-track">
                          <div
                            className="growth-bar-fill self"
                            style={{
                              width: ownLog
                                ? `${Math.max(4, (numberValue(ownLog.weight_oz) / cohortMaxWeight) * 100)}%`
                                : "0%"
                            }}
                          />
                        </div>
                        <b>{ownLog ? `${numberValue(ownLog.weight_oz).toFixed(1)} oz` : "no record"}</b>
                      </div>
                      <div className="cohort-bar-row">
                        <span>Cohort avg</span>
                        <div className="growth-bar-track">
                          <div
                            className="growth-bar-fill average"
                            style={{ width: `${Math.max(4, (average / cohortMaxWeight) * 100)}%` }}
                          />
                        </div>
                        <b>{average.toFixed(1)} oz</b>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No cohort comparison yet</h3>
              <p>Add weight logs for more birds in {cohortLabel} to compare growth by age.</p>
            </div>
          )}
        </div>
      </section>

      {onCreateWeightLog ? (
        <section className="subpanel table-section">
          <div className="table-section-header">
            <div>
              <p className="eyebrow">Weigh-in</p>
              <h3>Log weight</h3>
              <p className="muted compact-copy">Add a new weight point for this bird's growth history.</p>
            </div>
          </div>
          <div className="table-card card-list-table">
            <form className="feed-form card-form" onSubmit={onCreateWeightLog}>
              <input name="birdId" type="hidden" defaultValue={bird.id} />
              <label>
                Weighed on
                <input name="weighedOn" required type="date" defaultValue={dateKeyDaysAgo(0)} />
              </label>
              <label>
                Weight, oz
                <input name="weightOz" required type="number" min="0.1" step="0.1" defaultValue={latestWeightLog?.weight_oz ?? bird.current_weight_oz ?? ""} />
              </label>
              <label className="wide-field">
                Notes
                <input name="notes" placeholder="Handling, condition, scale notes..." />
              </label>
              <button disabled={busy} type="submit">
                {busy ? "Saving..." : "Log weight"}
              </button>
            </form>
            {birdWeightLogs.length ? (
              <div className="source-summary weight-log-summary">
                {birdWeightLogs
                  .slice()
                  .reverse()
                  .map((log) => (
                    <article key={log.id}>
                      <div>
                        <strong>{numberValue(log.weight_oz).toFixed(1)} oz</strong>
                        <span>
                          {displayDate(log.weighed_on)} · {ageLabelFromDays(ageDaysOn(bird.hatch_date, log.weighed_on))}
                          {log.notes ? ` · ${log.notes}` : ""}
                        </span>
                      </div>
                      <button
                        className="danger"
                        disabled={busy || !onDeleteWeightLog}
                        type="button"
                        onClick={() => {
                          if (onDeleteWeightLog && confirm("Delete this weight log?")) onDeleteWeightLog(log.id);
                        }}
                      >
                        Delete
                      </button>
                    </article>
                  ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="subpanel table-section">
        <div className="table-section-header">
          <div>
            <p className="eyebrow">Lineage</p>
            <h3>Family tree</h3>
            <p className="muted compact-copy">Shows known sire and hen-group context from the hatch batch and mating period.</p>
          </div>
        </div>
        <div className="table-card value-card">
          {hatchBatch || bird.breeding_line_name ? (
            <div className="lineage-tree">
              <div className="lineage-level lineage-parents">
                <div className="lineage-node parent">
                  <span>Sire</span>
                  {sireBird && onOpenRecord ? (
                    <button className="link-button lineage-link" type="button" onClick={() => onOpenRecord({ type: "bird", id: sireBird.id })}>
                      {birdLabel(sireBird)}
                    </button>
                  ) : (
                    <strong>{matingPeriod?.sire_label || "Unknown sire"}</strong>
                  )}
                  <small>Known male for this pen period</small>
                </div>
                <div className="lineage-node parent">
                  <span>Hen group</span>
                  {henBirds.length && onOpenRecord ? (
                    <div className="lineage-link-list">
                      {henBirds.map((hen) => (
                        <button key={hen.id} className="link-button lineage-link" type="button" onClick={() => onOpenRecord({ type: "bird", id: hen.id })}>
                          {birdLabel(hen)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <strong>{henLabels}</strong>
                  )}
                  <small>{matingPeriod ? `${matingPeriod.hen_count} hens in group` : "Individual dam is intentionally not assumed"}</small>
                </div>
              </div>

              <div className="lineage-level">
                <div className="lineage-node current">
                  <span>Bird</span>
                  <strong>{bird.band || bird.name || "Unbanded bird"}</strong>
                  <small>{formatBirdSex(bird.sex)} · {formatBirdStatus(bird.status)} · hatched {displayDate(hatchBatch?.hatch_date || bird.hatch_date, "unknown")}</small>
                  <div className="lineage-context">
                    {breedingLineId && onOpenRecord ? (
                      <button type="button" onClick={() => onOpenRecord({ type: "breedingLine", id: breedingLineId })}>
                        Line: {breedingLineName}
                      </button>
                    ) : (
                      <span>Line: {breedingLineName}</span>
                    )}
                    {hatchBatch?.mating_period_id && onOpenRecord ? (
                      <button type="button" onClick={() => onOpenRecord({ type: "matingPeriod", id: hatchBatch.mating_period_id! })}>
                        Period: {hatchBatch.mating_period_label || matingPeriod?.label || "Unknown"}
                      </button>
                    ) : (
                      <span>Period: {hatchBatch?.mating_period_label || matingPeriod?.label || "Unknown"}</span>
                    )}
                    {hatchBatch && onOpenRecord ? (
                      <button type="button" onClick={() => onOpenRecord({ type: "hatchBatch", id: hatchBatch.id })}>
                        Batch: {hatchBatch.label}
                      </button>
                    ) : (
                      <span>Batch: {bird.hatch_batch_label || "No hatch batch linked"}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <h3>No lineage yet</h3>
              <p>No hatch batch or breeding line is linked yet. Birds created from hatch batches will show sire and hen group context here.</p>
            </div>
          )}
        </div>
      </section>

      <CreateRecordPanel buttonLabel="Edit bird" eyebrow="Record" title="Edit bird">
        <form
          className="bird-form"
          onSubmit={(event) => {
            event.preventDefault();
            onUpdateBird(bird.id, event.currentTarget);
          }}
        >
          <label>
            Name
            <input name="name" defaultValue={bird.name ?? ""} />
          </label>
          <label>
            Band
            <input name="band" defaultValue={bird.band ?? ""} />
          </label>
          <label>
            Sex
            <BirdSexSelect defaultValue={bird.sex} />
          </label>
          <label>
            Status
            <BirdStatusSelect defaultValue={bird.status} />
          </label>
          <label>
            Coop
            <CoopSelect coops={coops} defaultValue={bird.coop_id ?? ""} />
          </label>
          <label>
            Hatch date
            <input name="hatchDate" type="date" defaultValue={normalizeDateKey(bird.hatch_date)} />
          </label>
          <label>
            Processed date
            <input name="processedDate" type="date" defaultValue={normalizeDateKey(bird.processed_date)} />
          </label>
          <label>
            Weight, oz
            <input name="currentWeightOz" type="number" min="0.1" step="0.1" defaultValue={bird.current_weight_oz ?? ""} />
          </label>
          <label className="wide-field">
            Notes
            <input name="notes" defaultValue={bird.notes ?? ""} />
          </label>
          <div className="row-actions">
            <button disabled={busy} type="submit">Save bird</button>
          </div>
        </form>
      </CreateRecordPanel>
    </section>
  );
}

const coopTypeOptions: Array<{ value: CoopType; label: string }> = [
  { value: "BREEDING", label: "Breeding" },
  { value: "GROW_OUT", label: "Grow out" },
  { value: "BROODER", label: "Brooder" },
  { value: "HOSPITAL", label: "Hospital" },
  { value: "OTHER", label: "Other" }
];

const birdSexOptions: Array<{ value: BirdSex; label: string }> = [
  { value: "UNKNOWN", label: "Unknown" },
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" }
];

const birdStatusOptions: Array<{ value: BirdStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "PROCESSED", label: "Processed" },
  { value: "SOLD", label: "Sold" },
  { value: "DIED", label: "Died" },
  { value: "RETIRED", label: "Retired" },
  { value: "CULLED", label: "Culled" }
];

const saleItemTypeOptions: Array<{ value: SaleItemType; label: string }> = [
  { value: "TABLE_EGGS", label: "Table eggs" },
  { value: "FERTILE_EGGS", label: "Fertile eggs" },
  { value: "CHICKS", label: "Chicks" },
  { value: "BIRDS", label: "Birds" },
  { value: "MEAT", label: "Meat" },
  { value: "OTHER", label: "Other" }
];

const healthEventTypeOptions: Array<{ value: HealthEventType; label: string }> = [
  { value: "HEALTH", label: "Health" },
  { value: "INJURY", label: "Injury" },
  { value: "TREATMENT", label: "Treatment" },
  { value: "QUARANTINE", label: "Quarantine" },
  { value: "BEHAVIOR", label: "Behavior" },
  { value: "MORTALITY", label: "Mortality" },
  { value: "OTHER", label: "Other" }
];

const healthSeverityOptions: Array<{ value: HealthSeverity; label: string }> = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
];

const healthOutcomeOptions: Array<{ value: HealthOutcome; label: string }> = [
  { value: "OPEN", label: "Open" },
  { value: "MONITORING", label: "Monitoring" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CULLED", label: "Culled" },
  { value: "DIED", label: "Died" }
];

function CoopTypeSelect({ defaultValue = "BREEDING" }: { defaultValue?: CoopType }) {
  return (
    <select name="type" defaultValue={defaultValue}>
      {coopTypeOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function formatCoopType(type: CoopType) {
  return {
    BREEDING: "Breeding",
    GROW_OUT: "Grow out",
    BROODER: "Brooder",
    HOSPITAL: "Hospital",
    OTHER: "Other"
  }[type];
}

function BirdSexSelect({ defaultValue = "UNKNOWN" }: { defaultValue?: BirdSex }) {
  return (
    <select name="sex" defaultValue={defaultValue}>
      {birdSexOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function BirdStatusSelect({ defaultValue = "ACTIVE" }: { defaultValue?: BirdStatus }) {
  return (
    <select name="status" defaultValue={defaultValue}>
      {birdStatusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CoopSelect({ coops, defaultValue = "" }: { coops: Coop[]; defaultValue?: string }) {
  return (
    <select name="coopId" defaultValue={defaultValue}>
      <option value="">No coop</option>
      {coops.map((coop) => (
        <option key={coop.id} value={coop.id}>
          {coop.name}
        </option>
      ))}
    </select>
  );
}

function BirdSelect({ birds, defaultValue = "" }: { birds: Bird[]; defaultValue?: string }) {
  return (
    <select name="birdId" defaultValue={defaultValue}>
      <option value="">No specific bird</option>
      {birds
        .filter((bird) => bird.status === "ACTIVE" || bird.id === defaultValue)
        .map((bird) => (
          <option key={bird.id} value={bird.id}>
            {birdLabel(bird)}
          </option>
        ))}
    </select>
  );
}

function birdLabel(bird: Bird) {
  return bird.band || bird.name || "Unbanded bird";
}

function formatBirdSex(sex: BirdSex) {
  return {
    UNKNOWN: "Unknown",
    FEMALE: "Female",
    MALE: "Male"
  }[sex];
}

function formatBirdStatus(status: BirdStatus) {
  return {
    ACTIVE: "Active",
    PROCESSED: "Processed",
    SOLD: "Sold",
    DIED: "Died",
    RETIRED: "Retired",
    CULLED: "Culled"
  }[status];
}

function formatSaleItemType(type: SaleItemType) {
  return saleItemTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function formatHealthEventType(type: HealthEventType) {
  return healthEventTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function formatHealthSeverity(severity: HealthSeverity) {
  return healthSeverityOptions.find((option) => option.value === severity)?.label ?? severity;
}

function formatHealthOutcome(outcome: HealthOutcome) {
  return healthOutcomeOptions.find((option) => option.value === outcome)?.label ?? outcome;
}

function healthSeverityPriority(severity: HealthSeverity): WorkItemPriority {
  if (severity === "CRITICAL" || severity === "HIGH") return "high";
  if (severity === "MEDIUM") return "medium";
  return "low";
}

function topSaleCategoryLabel(sales: SaleRecord[]) {
  const totals = sales.reduce<Map<SaleItemType, number>>((groups, sale) => {
    groups.set(sale.item_type, (groups.get(sale.item_type) ?? 0) + numberValue(sale.total_price));
    return groups;
  }, new Map());
  const top = Array.from(totals.entries()).sort((a, b) => b[1] - a[1])[0];
  return top ? formatSaleItemType(top[0]) : "None yet";
}
