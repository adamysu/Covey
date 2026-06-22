# Prototype Parity Audit

Date: 2026-06-05

The static prototype remains the product reference. This audit compares the prototype sections in `outputs/quail-manager` against the backend-backed app in `work/covey-app`.

## Summary

Overall status: mostly matched, with backend-only upgrades added.

The backend app now covers the prototype's core workflow areas:

- Dashboard metrics and navigation
- Flock records, configurable flock table columns, sorting, filters, bird detail pages, weight history, ROI/value, and lineage
- Coop management, coop detail pages, coop types, protected deletes, and camera support
- Egg logging with create/edit/delete, fertility metrics, filters, sorting, and value metrics
- Feed catalog, inventory/restocks, top-offs, cost rollups, per-bird cost estimates, sorting, bulk actions, and dashboard cost metrics
- Incubation cycles, per-cycle overrides, timeline, candle/lockdown/hatch reminders, hatch-batch creation, and optional chick records
- Breeding lines, pen mating periods, hen groups, line/period stats, recommendations, and detail pages
- Separate To Do and Recommendations sections with sidebar badge counts
- Settings for homestead, flock planning, tracking, value model, incubation, data import/export, theme, and users
- Secure backend user management, roles, password reset, optional MFA, sessions, and Docker Compose deployment

## Section Comparison

| Prototype area | Backend app status | Notes |
| --- | --- | --- |
| Overview dashboard | Matched plus expanded | Backend adds feed inventory value, active bird counts, and backend-backed navigation. Removed old copy that implied features were still future-only. |
| Flock | Matched | Includes bird create/edit/delete, row-to-detail navigation, filters, sorting, selected columns, active band uniqueness, weight history, growth comparison, ROI/value, and lineage. |
| Coops | Matched plus expanded | Prototype modal management is superseded by list/detail pages, bulk actions, camera-enabled indicators, RTSP camera setup, and camera playback. |
| Egg production | Matched plus expanded | Includes create/edit/delete, sortable table, filters, fertility metrics, source summaries, and dashboard/sidebar counts. |
| Feed | Matched plus expanded | Includes feed catalog, restocks/inventory, top-offs, cost per coop, estimated bird cost, detail pages, bulk actions, and dashboard cost metrics. Feed top-off unit setting now drives the top-off form default. |
| Breeding | Matched plus expanded | Breeding line and pen mating period concepts are preserved, with line/period detail pages and performance summaries. |
| Incubation | Matched | Includes cycle timing, per-cycle parameter overrides, visual timeline, reminders, hatch batch creation, and optional chick creation. Coturnix preset button is present in Settings. |
| To Do | Matched | Time-based tasks are separated from recommendations. |
| Recommendations | Matched | Advisory recommendations are separate from tasks and badge count is based on pending recommendation items. |
| Settings | Matched plus expanded | Backend adds secure users, Data import/export, theme toggle, and homestead settings. |
| Prototype export/import | Backend upgrade | Backend can export sanitized homestead JSON and import with validation, dependency ordering, conflict checks, and before/after totals. |
| Local prototype users/PINs | Intentionally superseded | Replaced by real accounts, roles, sessions, password reset, and optional MFA. |
| Browser-only storage | Intentionally superseded | Replaced by Postgres-backed records and Docker Compose deployment. |
| Camera page | Backend-only upgrade | Not in the original prototype, but added from later requirements. |

## Remaining Confirmation Work

- Run a full Docker build in an environment where Docker buildx can write to the local Docker activity directory.
- Perform a browser smoke test on the rebuilt app: Settings, Flock, Coops, Feed, Eggs, Incubation, Breeding, To Do, Recommendations, Cameras, and Data import preview.
- Optional: import a real prototype export and compare dashboard totals after import.

## Runtime Smoke Attempt

2026-06-05: The in-app browser reached `http://localhost:3000/`, the Covey UI loaded, and the API status showed online. Authenticated smoke testing could not continue because the running install already has an owner account and no owner credentials were available in this thread. Sign in with an owner account, then rerun the section-by-section smoke checklist above.

## Known Non-Blocking Differences

- Several prototype modals are now backend detail pages. This is intentional because row-to-detail navigation is clearer for larger records.
- The backend app has extra sections not present in the prototype, especially Cameras and Data.
- Raw camera RTSP URLs are intentionally excluded from export for security.
