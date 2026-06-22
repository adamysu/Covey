import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config/env.js";
import { db } from "../db.js";
import { getSessionUser } from "../services/sessions.js";

const coopTypeSchema = z.enum(["BREEDING", "GROW_OUT", "BROODER", "HOSPITAL", "OTHER"]);

const coopInputSchema = z.object({
  name: z.string().min(1).max(120),
  type: coopTypeSchema,
  capacity: z.number().int().positive().nullable().optional(),
  cameraRtspUrl: z.string().max(1000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional()
});

const coopPatchSchema = coopInputSchema.partial();

const paramsSchema = z.object({
  id: z.string().uuid()
});

function cameraStreamName(coopId: string, cameraUrl: string) {
  const urlHash = createHash("sha256").update(cameraUrl).digest("hex").slice(0, 10);
  return `covey_${coopId.replaceAll("-", "_")}_${urlHash}`;
}

type BrowserPlaybackMode = "webrtc" | "mse" | "auto" | "mjpeg";

function go2rtcPlayerUrl(streamName: string, mode: Exclude<BrowserPlaybackMode, "mjpeg">) {
  if (!env.GO2RTC_PUBLIC_URL) return null;

  const url = new URL("/stream.html", env.GO2RTC_PUBLIC_URL);
  url.searchParams.set("src", streamName);
  if (mode !== "auto") {
    url.searchParams.set("mode", mode);
  }
  return url.toString();
}

function cameraPlaybackMode(): BrowserPlaybackMode {
  if (!env.GO2RTC_PUBLIC_URL) return "mjpeg";
  return env.GO2RTC_PLAYBACK_MODE;
}

function go2rtcPlayerUrls(streamName: string) {
  return {
    auto: go2rtcPlayerUrl(streamName, "auto"),
    webrtc: go2rtcPlayerUrl(streamName, "webrtc"),
    mse: go2rtcPlayerUrl(streamName, "mse")
  };
}

async function go2rtcStreamsText() {
  return fetch(`${env.GO2RTC_URL}/api/streams`)
    .then((result) => result.text())
    .catch(() => "");
}

async function go2rtcStreamInfo(streamName: string) {
  const streams = await go2rtcStreamsText();
  const info = {
    raw: streams.slice(0, 4000),
    codecs: [] as string[],
    videoCodecs: [] as string[],
    audioCodecs: [] as string[],
    producerCount: 0,
    consumerCount: 0
  };

  try {
    const parsed = JSON.parse(streams) as unknown;
    const stream =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)[streamName]
        : null;
    const streamText = JSON.stringify(stream ?? parsed);
    info.producerCount = (streamText.match(/producer/gi) ?? []).length;
    info.consumerCount = (streamText.match(/consumer/gi) ?? []).length;
    const codecMatches = streamText.match(/\b(?:h264|h265|hevc|aac|opus|pcma|pcmu|mjpeg|jpeg)\b/gi) ?? [];
    info.codecs = Array.from(new Set(codecMatches.map((codec) => codec.toUpperCase())));
    info.videoCodecs = info.codecs.filter((codec) => ["H264", "H265", "HEVC", "MJPEG", "JPEG"].includes(codec));
    info.audioCodecs = info.codecs.filter((codec) => ["AAC", "OPUS", "PCMA", "PCMU"].includes(codec));
  } catch {
    const streamIndex = streams.indexOf(streamName);
    const streamText = streamIndex >= 0 ? streams.slice(streamIndex, streamIndex + 2000) : streams;
    const codecMatches = streamText.match(/\b(?:h264|h265|hevc|aac|opus|pcma|pcmu|mjpeg|jpeg)\b/gi) ?? [];
    info.codecs = Array.from(new Set(codecMatches.map((codec) => codec.toUpperCase())));
    info.videoCodecs = info.codecs.filter((codec) => ["H264", "H265", "HEVC", "MJPEG", "JPEG"].includes(codec));
    info.audioCodecs = info.codecs.filter((codec) => ["AAC", "OPUS", "PCMA", "PCMU"].includes(codec));
  }

  return info;
}

function webrtcNotes(info: Awaited<ReturnType<typeof go2rtcStreamInfo>>) {
  const notes: string[] = [];
  const hasKnownVideoCodec = info.videoCodecs.length > 0;
  if (!hasKnownVideoCodec) {
    notes.push("go2rtc did not expose codec details for this stream, so this check cannot confirm whether the camera is H.264 or H.265.");
  } else if (info.videoCodecs.includes("H265") || info.videoCodecs.includes("HEVC")) {
    notes.push("The stream appears to use H.265/HEVC. Many browsers cannot play H.265 through WebRTC; MSE may work while WebRTC falls back.");
  }
  if (hasKnownVideoCodec && !info.videoCodecs.includes("H264")) {
    notes.push("No H.264 video codec was detected in go2rtc stream info. Browser WebRTC is most reliable with H.264.");
  }
  if (!env.GO2RTC_WEBRTC_CANDIDATE.includes(":")) {
    notes.push("The WebRTC candidate does not include a port. Use a browser-reachable host:port such as 127.0.0.1:8555 for local viewing.");
  }
  if (env.GO2RTC_WEBRTC_CANDIDATE.startsWith("127.") || env.GO2RTC_WEBRTC_CANDIDATE.startsWith("localhost")) {
    notes.push("The WebRTC candidate is loopback-only. That is OK from this same computer, but use the server's LAN IP if viewing from another device.");
  }
  if (!notes.length) {
    notes.push("No obvious codec issue was detected. If WebRTC still does not connect, the next suspect is ICE/network reachability to the configured candidate.");
  }
  return notes;
}

async function fetchMjpegSource(source: string) {
  const upstreamUrl = `${env.GO2RTC_URL}/api/stream.mjpeg?src=${encodeURIComponent(source)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const upstream = await fetch(upstreamUrl, { signal: controller.signal });
    return { upstream, upstreamUrl };
  } catch {
    return { upstream: null, upstreamUrl };
  } finally {
    clearTimeout(timeout);
  }
}

function toNodeReadable(body: unknown) {
  return Readable.fromWeb(body as unknown as NodeReadableStream<Uint8Array>);
}

async function openMjpegStream(streamName: string) {
  const sources = [streamName, `ffmpeg:${streamName}#video=mjpeg`];
  for (const source of sources) {
    const { upstream, upstreamUrl } = await fetchMjpegSource(source);
    if (upstream?.ok && upstream.body) {
      return { upstream, source, upstreamUrl };
    }
    upstream?.body?.cancel().catch(() => undefined);
  }
  return null;
}

async function cameraUrlForCoop(coopId: string, homesteadId: string) {
  const result = await db.query(
    `select camera_rtsp_url
       from coops
      where id = $1
        and homestead_id = $2`,
    [coopId, homesteadId]
  );
  return result.rows[0]?.camera_rtsp_url as string | null | undefined;
}

async function ensureGo2rtcStream(coopId: string, cameraUrl: string) {
  const streamName = cameraStreamName(coopId, cameraUrl);
  const streamUrl = `${env.GO2RTC_URL}/api/streams?name=${encodeURIComponent(streamName)}&src=${encodeURIComponent(cameraUrl)}`;
  const response = await fetch(streamUrl, { method: "PUT" });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`go2rtc could not register stream ${streamName}: ${response.status} ${body}`.trim());
  }

  const yaml = [
    "webrtc:",
    `  listen: ${JSON.stringify(env.GO2RTC_WEBRTC_LISTEN)}`,
    "  candidates:",
    `    - ${JSON.stringify(env.GO2RTC_WEBRTC_CANDIDATE)}`,
    "streams:",
    `  ${streamName}: ${JSON.stringify(cameraUrl)}`,
    ""
  ].join("\n");
  await fetch(`${env.GO2RTC_URL}/api/config`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/yaml"
    },
    body: yaml
  }).catch(() => undefined);

  const streams = await go2rtcStreamsText();
  if (!streams.includes(streamName)) {
    throw new Error(`go2rtc accepted stream ${streamName}, but it was not listed by /api/streams.`);
  }

  return streamName;
}

async function requireEditor(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request);
  if (!user) {
    reply.code(401).send({ message: "Not signed in." });
    return null;
  }
  if (user.role === "VIEWER") {
    reply.code(403).send({ message: "Read-only users cannot change coop records." });
    return null;
  }
  return user;
}

export async function coopRoutes(app: FastifyInstance) {
  app.get("/coops", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });

    const result = await db.query(
      `select coops.id,
              coops.name,
              coops.type,
              coops.capacity,
              coops.camera_rtsp_url is not null as has_camera,
              coops.notes,
              coops.created_at,
              coops.updated_at,
              count(birds.id)::int as bird_count,
              count(birds.id) filter (where birds.status = 'ACTIVE')::int as active_bird_count
         from coops
         left join birds on birds.coop_id = coops.id
          and birds.homestead_id = coops.homestead_id
        where coops.homestead_id = $1
        group by coops.id
        order by coops.name asc`,
      [user.homestead_id]
    );

    return { coops: result.rows };
  });

  app.post("/coops", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const input = coopInputSchema.parse(request.body);

    try {
      const result = await db.query(
        `insert into coops (homestead_id, name, type, capacity, camera_rtsp_url, notes)
         values ($1, $2, $3, $4, $5, $6)
         returning id, name, type, capacity, camera_rtsp_url is not null as has_camera, notes, created_at, updated_at`,
        [
          user.homestead_id,
          input.name,
          input.type,
          input.capacity ?? null,
          input.cameraRtspUrl || null,
          input.notes ?? null
        ]
      );

      return reply.code(201).send({ coop: result.rows[0] });
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return reply.code(409).send({ message: "A coop with that name already exists." });
      }
      throw error;
    }
  });

  app.patch("/coops/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);
    const input = coopPatchSchema.parse(request.body);

    try {
      const result = await db.query(
        `update coops
            set name = coalesce($3, name),
                type = coalesce($4, type),
                capacity = case when $5 then $6 else capacity end,
                camera_rtsp_url = case when $7 then $8 else camera_rtsp_url end,
                notes = case when $9 then $10 else notes end,
                updated_at = now()
          where id = $1
            and homestead_id = $2
          returning id, name, type, capacity, camera_rtsp_url is not null as has_camera, notes, created_at, updated_at`,
        [
          params.id,
          user.homestead_id,
          input.name ?? null,
          input.type ?? null,
          Object.hasOwn(input, "capacity"),
          input.capacity ?? null,
          Object.hasOwn(input, "cameraRtspUrl"),
          input.cameraRtspUrl || null,
          Object.hasOwn(input, "notes"),
          input.notes ?? null
        ]
      );

      if (!result.rows[0]) return reply.code(404).send({ message: "Coop not found." });

      let cameraSync: { ok: boolean; message: string } | null = null;
      if (Object.hasOwn(input, "cameraRtspUrl") && input.cameraRtspUrl) {
        try {
          const streamName = await ensureGo2rtcStream(params.id, input.cameraRtspUrl);
          cameraSync = { ok: true, message: `Camera stream registered as ${streamName}.` };
        } catch (error) {
          cameraSync = {
            ok: false,
            message: error instanceof Error ? error.message : "go2rtc could not register this camera stream."
          };
        }
      }

      return { coop: result.rows[0], cameraSync };
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return reply.code(409).send({ message: "A coop with that name already exists." });
      }
      throw error;
    }
  });

  app.get("/coops/:id/camera/mjpeg", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const params = paramsSchema.parse(request.params);

    const cameraUrl = await cameraUrlForCoop(params.id, user.homestead_id);
    if (!cameraUrl) return reply.code(404).send({ message: "No camera is configured for this coop." });

    let streamName: string;
    try {
      streamName = await ensureGo2rtcStream(params.id, cameraUrl);
    } catch (error) {
      return reply.code(502).send({
        message: error instanceof Error ? error.message : "go2rtc could not register this camera stream."
      });
    }
    const mjpeg = await openMjpegStream(streamName);
    if (!mjpeg) {
      return reply.code(502).send({
        message: "MJPEG fallback is not available for this camera stream. Try Auto, MSE, or WebRTC playback."
      });
    }

    reply.header("Cache-Control", "no-store");
    reply.header("Connection", "keep-alive");
    reply.header("X-Covey-Camera-Source", mjpeg.source);
    reply.header("Content-Type", mjpeg.upstream.headers.get("content-type") ?? "multipart/x-mixed-replace");
    return reply.send(toNodeReadable(mjpeg.upstream.body));
  });

  app.get("/coops/:id/camera/status", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const params = paramsSchema.parse(request.params);

    const cameraUrl = await cameraUrlForCoop(params.id, user.homestead_id);
    if (!cameraUrl) return reply.code(404).send({ message: "No camera is configured for this coop." });
    let streamName: string;
    try {
      streamName = await ensureGo2rtcStream(params.id, cameraUrl);
    } catch (error) {
      return reply.code(502).send({
        message: error instanceof Error ? error.message : "go2rtc could not register this camera stream."
      });
    }

    const playbackMode = cameraPlaybackMode();

    return {
      camera: {
        configured: true,
        streamName,
        mjpegUrl: `/coops/${params.id}/camera/mjpeg`,
        playbackMode,
        health: "registered",
        playerUrl: playbackMode === "mjpeg" ? null : go2rtcPlayerUrl(streamName, playbackMode),
        playerUrls: go2rtcPlayerUrls(streamName)
      }
    };
  });

  app.get("/coops/:id/camera/health", async (request, reply) => {
    const user = await getSessionUser(request);
    if (!user) return reply.code(401).send({ message: "Not signed in." });
    const params = paramsSchema.parse(request.params);

    const cameraUrl = await cameraUrlForCoop(params.id, user.homestead_id);
    if (!cameraUrl) return reply.code(404).send({ message: "No camera is configured for this coop." });

    let streamName: string;
    try {
      streamName = await ensureGo2rtcStream(params.id, cameraUrl);
    } catch (error) {
      return reply.code(502).send({
        health: {
          ok: false,
          streamRegistered: false,
          mjpegAvailable: false,
          message: error instanceof Error ? error.message : "go2rtc could not register this camera stream."
        }
      });
    }

    const streamInfo = await go2rtcStreamInfo(streamName);
    const mjpeg = await openMjpegStream(streamName);
    const mjpegAvailable = Boolean(mjpeg?.upstream.ok && mjpeg.upstream.body);
    mjpeg?.upstream.body?.cancel().catch(() => undefined);
    const notes = webrtcNotes(streamInfo);

    return {
      health: {
        ok: true,
        streamRegistered: true,
        mjpegAvailable,
        mjpegSource: mjpeg?.source ?? null,
        preferredPlayback: cameraPlaybackMode(),
        webrtcCandidate: env.GO2RTC_WEBRTC_CANDIDATE,
        webrtcListen: env.GO2RTC_WEBRTC_LISTEN,
        playerUrls: go2rtcPlayerUrls(streamName),
        streamInfo: {
          codecs: streamInfo.codecs,
          videoCodecs: streamInfo.videoCodecs,
          audioCodecs: streamInfo.audioCodecs,
          producerCount: streamInfo.producerCount,
          consumerCount: streamInfo.consumerCount
        },
        diagnostics: notes,
        message: mjpegAvailable
          ? "Camera stream registered. Browser playback is available; MJPEG fallback also responded."
          : "Camera stream registered. MJPEG fallback did not respond, but Auto/MSE/WebRTC may still work through go2rtc."
      }
    };
  });

  app.delete("/coops/:id", async (request, reply) => {
    const user = await requireEditor(request, reply);
    if (!user) return;
    const params = paramsSchema.parse(request.params);

    const result = await db.query(
      `delete from coops
        where id = $1
          and homestead_id = $2
        returning id`,
      [params.id, user.homestead_id]
    );

    if (!result.rows[0]) return reply.code(404).send({ message: "Coop not found." });
    return { ok: true };
  });
}
