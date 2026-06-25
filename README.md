# Covey

Covey is the deployable version of the quail management app. It is intentionally separate from the static prototype so the prototype can keep working while the production app grows behind it.

## What Is Included

- React web app served by nginx
- Fastify API with TypeScript
- Postgres database with the first production schema
- Account registration and login foundation
- HTTP-only session cookies
- Password hashing with Argon2id
- Security headers, CORS, and rate limiting
- Docker Compose for local and server deployment
- Database migration SQL for the quail domain model
- Internal go2rtc camera proxy for coop RTSP playback
- Sanitized JSON export, import preview/import, and local backup scheduler
- Sales, health records, profile photos, audit history, calendar, and CSV reports
- Bird type/variety profiles for age, weight-context, and egg-goal targets

## Quick Start

1. Copy the example environment file.

   ```sh
   cp .env.example .env
   ```

2. Edit `.env` and replace the placeholder passwords and session secret.

3. Start the stack.

   ```sh
   docker compose up --build
   ```

4. Open the app.

   - Web: http://localhost:3000
   - API health: http://localhost:8080/health

On first launch, Covey creates one owner account for one homestead. After that, the Create account
screen is hidden and owners add more users from Settings. Emails are unique within the install; the
same email cannot create a separate second homestead in this version.

The camera proxy is exposed on localhost by default for troubleshooting at http://localhost:1984.
The browser asks Covey's API for the normal coop camera stream; raw RTSP URLs are not returned in
coop list records.
Opening a coop camera patches go2rtc's config with a named stream like
`covey_<coop id>_<rtsp url hash>`, so changing a saved RTSP URL creates a fresh stream registration.
The stream should appear in the go2rtc UI after you open the camera page in Covey.
Covey uses go2rtc's MSE browser playback by default and keeps Auto, WebRTC, and MJPEG available from
the camera player. For Docker WebRTC playback, go2rtc needs a browser-reachable ICE
candidate. The local default is `GO2RTC_WEBRTC_CANDIDATE=127.0.0.1:8555`; use your server LAN IP
instead if you watch cameras from another device. Covey defaults go2rtc WebRTC to
`GO2RTC_WEBRTC_LISTEN=:8555/tcp` so Docker uses a predictable mapped port. Set
`GO2RTC_PLAYBACK_MODE` to `mse`, `auto`, `webrtc`, or `mjpeg` if you need a different default.

Settings -> Data includes a backup bundle download and a backup scheduler. The bundle is a zip with
`data.json` and optional uploaded photos. Scheduled backups still write sanitized JSON exports to the
API backup volume (`backup-data`, mounted at `BACKUP_DIR`, default `/app/backups`). These files
exclude passwords, sessions, MFA secrets, reset tokens, raw camera URLs, audit history, backup run
history, and database dumps. They do include the later app sections such as feed inventory, sales, and
health records. Keep normal Postgres backups plus upload volume archives as your full-transfer source
of truth; in-app bundles/JSON backups are meant for portable homestead records.

## Development Mode

For live reload while building the app:

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Home Server Deployment

See [docs/deployment.md](docs/deployment.md) for the V1 home-server guide, including:

- source deploy vs Docker registry deploy;
- production `.env` checklist;
- LAN camera settings;
- backup and restore commands;
- update and rollback workflow.

## Upgrade Workflow

For a self-hosted deployment, the intended pattern is:

1. Back up Postgres.
2. Pull or deploy the new app version.
3. Restart the services.
4. Check `/health` and sign in.

The API runs idempotent database migrations before starting. You can still run migrations manually if
you want to inspect them before restart.

Example:

```sh
docker compose exec postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backups/covey-$(date +%F).sql
docker compose pull
docker compose up -d --build
```

## Production Notes

- Set `COOKIE_SECURE=true` when serving over HTTPS.
- Use a long random `SESSION_SECRET`; do not reuse the example.
- Keep Postgres behind the Compose network unless there is a deliberate reason to expose it.
- Keep go2rtc bound to `127.0.0.1` unless you deliberately want direct stream administration from
  a trusted private network.
- Put a TLS reverse proxy in front of the web service for public deployments.
- Keep both Postgres backups and Covey's sanitized JSON backups before putting real flock records here.

## Current Status

The deployable app now covers the core prototype workflows plus backend-only upgrades such as
accounts, cameras, reports, sales, health records, profile photos, backups, audit history, and
home-server deployment. The main remaining V1 work is polish, deployment hardening, and optional
extensions such as printable report presets, broader inventory, CSV import helpers, and breeding
decision tools.
