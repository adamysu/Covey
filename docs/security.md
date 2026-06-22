# Security Checklist

## Before Real Use

- Replace every secret in `.env`.
- Set `COOKIE_SECURE=true` behind HTTPS.
- Use a TLS reverse proxy such as Caddy, Traefik, or nginx.
- Keep the Postgres port private.
- Schedule backups and test restore.
- Limit server SSH access.
- Keep Docker images updated.

## Account Security

Current foundation:

- Passwords are hashed with Argon2id.
- Sessions use random tokens stored as hashes in the database.
- Session cookies are HTTP-only.
- CORS is restricted to the configured web origin.
- API routes have rate limiting.

Recommended next steps:

- Email verification before inviting additional users.
- Password reset flow with short-lived one-time tokens.
- Optional two-factor authentication.
- Admin screen for disabling users.
- Audit log UI for important changes.

## Data Safety

Records that affect flock history should usually be soft-deleted or archived rather than permanently deleted. For example, a processed bird should become inactive, but the record should remain available for lineage, ROI, feed cost, and hatch history.
