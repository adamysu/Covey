import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  API_PORT: z.coerce.number().int().positive().default(8080),
  SESSION_SECRET: z.string().min(32),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default("false"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  GO2RTC_URL: z.string().url().default("http://go2rtc:1984"),
  GO2RTC_PUBLIC_URL: z.string().url().optional(),
  GO2RTC_PLAYBACK_MODE: z.enum(["webrtc", "mse", "auto", "mjpeg"]).default("mse"),
  GO2RTC_WEBRTC_CANDIDATE: z.string().min(1).default("127.0.0.1:8555"),
  GO2RTC_WEBRTC_LISTEN: z.string().min(1).default(":8555/tcp"),
  BACKUP_DIR: z.string().min(1).default("/app/backups"),
  UPLOAD_DIR: z.string().min(1).default("/app/uploads"),
  BACKUP_SCHEDULE_CHECK_MS: z.coerce.number().int().positive().default(60 * 60 * 1000)
});

export const env = schema.parse(process.env);
