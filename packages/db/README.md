# Database

Migrations live in `migrations`.

The first migration creates the baseline schema. It is mounted into the Postgres container as an initialization script for first startup, and can also be run with:

```sh
docker compose run --rm api npm run db:migrate
```

For later releases, add new migration folders instead of editing old migrations after they have been used in production.
