# Home Server Deployment

This guide is for running Covey on a server you control at home.

## Should You Use a Docker Registry?

You do not upload the source code to a Docker registry. A registry stores built container images.

For Covey there are two reasonable deployment patterns:

- **Source deploy:** copy or pull the Covey repo onto the server and run `docker compose up --build`.
- **Registry deploy:** build `covey-api` and `covey-web` images, push those images to a registry, then have the server pull them.

For one home server, source deploy is simplest. A registry is useful when:

- the server is slow at building images;
- you want repeatable tagged releases;
- you want to deploy the same image to more than one server;
- you want CI/GitHub Actions to build images for you later.

Important: the web image bakes in `PUBLIC_API_URL` at build time through Vite. If you push a web image to a registry, build it with the API URL your browser will use on that deployment.

## First Install

1. Copy the production env template.

   ```sh
   cp .env.production.example .env
   ```

2. Edit `.env`.

   Required changes:

   - `POSTGRES_PASSWORD`
   - `DATABASE_URL` password to match `POSTGRES_PASSWORD`
   - `SESSION_SECRET`
   - `API_HOST_PORT` if host port `8080` is already in use
   - `PUBLIC_API_URL`
   - `CORS_ORIGIN`

3. Start Covey.

   ```sh
   docker compose up -d --build
   ```

4. Open the app.

   - Web: `http://SERVER_IP:3000`
   - API health: `http://SERVER_IP:API_HOST_PORT/health`

5. Create the first owner account and homestead.

## LAN Camera Settings

If you view cameras from the same server, the localhost defaults are fine.

If you view cameras from another device on your LAN, update these values:

```env
GO2RTC_PUBLIC_URL=http://SERVER_IP:1984
GO2RTC_WEBRTC_CANDIDATE=SERVER_IP:8555
```

Keep `GO2RTC_BIND=127.0.0.1` if you do not want the go2rtc admin UI exposed to your LAN. If you do expose it, use only a trusted private network.

## HTTPS / Reverse Proxy

For LAN-only use, plain HTTP may be enough.

If you expose Covey through HTTPS, put Caddy, Traefik, nginx, or another TLS proxy in front of it and set:

```env
COOKIE_SECURE=true
CORS_ORIGIN=https://your-covey-host.example
PUBLIC_API_URL=https://your-covey-api-host.example
```

Do not expose Postgres directly to the internet.

## Backups

Covey has three kinds of important data:

- **Postgres volume:** primary source of truth for app records and users.
- **Upload volume:** profile photos and uploaded files.
- **Backup volume:** sanitized JSON exports created by the in-app backup scheduler.

The Compose volumes are:

- `covey_postgres-data`
- `covey_upload-data`
- `covey_backup-data`

Use Postgres backups for disaster recovery. Use Covey backup bundles/JSON exports for portable
homestead records.

The in-app backup bundle is a zip that includes `data.json` and, when selected, uploaded photos. It
covers homestead settings and flock records, including birds, coops, breeding lines, mating periods,
hen groups, incubations, hatch batches, egg logs, weight logs, feed catalog entries, feed
inventory/restocks, feed top-offs, sales, and health records. It intentionally does not include
password/session/MFA secrets, raw RTSP camera URLs, audit history, backup run history, or a database
dump.

Restore supports scoped recovery. You can restore all records or a selected area such as feed, eggs,
birds, incubation, health, photos, or settings. The safe default skips existing records and uses them
for references. Replacing a selected scope is owner-only, creates a pre-restore records backup, and
requires a typed confirmation.

For a clean full-server move, use the Postgres backup plus the upload volume archive. The in-app
bundle is useful for portable records/photos, but it is not a full byte-for-byte server migration by
itself.

Manual Postgres backup:

```sh
mkdir -p backups
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "backups/covey-$(date +%F).sql"
```

Manual upload/backup volume archive:

```sh
mkdir -p backups
docker run --rm \
  -v covey_upload-data:/data:ro \
  -v "$PWD/backups":/backup \
  alpine tar czf /backup/covey-uploads-$(date +%F).tgz -C /data .

docker run --rm \
  -v covey_backup-data:/data:ro \
  -v "$PWD/backups":/backup \
  alpine tar czf /backup/covey-json-backups-$(date +%F).tgz -C /data .
```

Restore Postgres into an empty database volume:

```sh
docker compose down
docker volume rm covey_postgres-data
docker compose up -d postgres
cat backups/covey-YYYY-MM-DD.sql | docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose up -d
```

Restore upload volume into an empty upload volume:

```sh
docker compose down
docker volume rm covey_upload-data
docker volume create covey_upload-data
docker run --rm \
  -v covey_upload-data:/data \
  -v "$PWD/backups":/backup \
  alpine tar xzf /backup/covey-uploads-YYYY-MM-DD.tgz -C /data
docker compose up -d
```

## Updating Covey

Source deploy:

```sh
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "backups/covey-before-update-$(date +%F).sql"
git pull
docker compose up -d --build
docker compose logs -f api
```

Registry deploy:

```sh
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "backups/covey-before-update-$(date +%F).sql"
docker compose -f docker-compose.yml -f docker-compose.registry.yml pull
docker compose -f docker-compose.yml -f docker-compose.registry.yml up -d --no-build
docker compose logs -f api
```

The API runs migrations at startup.

## Rollback

Source deploy:

```sh
git checkout PREVIOUS_TAG_OR_COMMIT
docker compose up -d --build
```

Registry deploy:

```env
COVEY_API_IMAGE=ghcr.io/your-user/covey-api:previous-tag
COVEY_WEB_IMAGE=ghcr.io/your-user/covey-web:previous-tag
```

Then:

```sh
docker compose -f docker-compose.yml -f docker-compose.registry.yml pull
docker compose -f docker-compose.yml -f docker-compose.registry.yml up -d --no-build
```

If a migration changed the database in a way the old app cannot read, restore the matching Postgres backup.

## Building And Pushing Registry Images

Example using GitHub Container Registry:

```sh
export REGISTRY=ghcr.io/YOUR_GITHUB_USER
export VERSION=0.1.0
export API_URL=http://SERVER_IP:8080

docker login ghcr.io

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f apps/api/Dockerfile \
  -t "$REGISTRY/covey-api:$VERSION" \
  -t "$REGISTRY/covey-api:latest" \
  --push .

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f apps/web/Dockerfile \
  --build-arg VITE_API_URL="$API_URL" \
  -t "$REGISTRY/covey-web:$VERSION" \
  -t "$REGISTRY/covey-web:latest" \
  --push .
```

On the server set:

```env
COVEY_API_IMAGE=ghcr.io/YOUR_GITHUB_USER/covey-api:0.1.0
COVEY_WEB_IMAGE=ghcr.io/YOUR_GITHUB_USER/covey-web:0.1.0
```

Then deploy with the registry override.

Use `--no-build` when starting with the registry override. The base Compose file still contains the
local Dockerfile build instructions for source deploys; `--no-build` tells Compose to use the pulled
images instead.

## First-Install Checklist

- `.env` has real passwords and a real `SESSION_SECRET`.
- `PUBLIC_API_URL` and `CORS_ORIGIN` match the URL used in the browser.
- `COOKIE_SECURE=true` if served through HTTPS.
- Postgres is not exposed publicly.
- Backup scheduler is configured in Settings.
- A manual Postgres backup has been tested.
- Upload volume backups include profile photos.
- Camera settings use the server LAN IP if viewing from another device.
