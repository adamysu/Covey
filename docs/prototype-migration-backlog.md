# Prototype Migration Backlog

The static prototype is the product reference. The deployable app should migrate it in backend-backed slices, not by copying localStorage behavior directly.

## Working Agreement

Stop relying on manual gap reports. For every migrated page, compare against the prototype first and carry the whole feature shape across in one backend-backed slice:

- Data model and API routes
- Create/edit/delete where records are user-managed
- Sorting, filters, and user-selected columns for list/table views
- Dashboard metrics and sidebar badges where the feature has counts or alerts
- Settings/configuration that affect the feature
- Dark mode, mobile layout, empty states, and readable action controls
- Smoke-test notes for the core flow

When a slice is completed, update this backlog before moving to the next one.

## Already Started

- First-install setup flow
- Account/session foundation
- Owner-managed user accounts
- Role-specific settings and record permissions
- Password reset token foundation
- Optional MFA with authenticator app codes
- Homestead settings foundation
- Prototype parity audit
- Coops
- Flock/bird records
- Active bird band uniqueness
- App shell/sidebar navigation
- Flock bird detail pages from list rows
- Bird detail ROI estimate and lifetime value breakdown chart
- Bird detail lineage card from hatch batch, sire, and hen group context
- Coop detail pages from list rows
- Flock table sorting and user-selected columns
- Feed catalog/log foundation
- Dashboard feed cost metrics
- Bird-level lifetime feed estimate in the flock table
- Feed inventory purchase/restock history
- Feed coop-level cost rollups and estimated cost per active bird
- Egg production log foundation
- Egg production dashboard/sidebar metrics
- Egg production trends, source summaries, and configurable value metrics
- Egg production filters by coop, bird, breeding line, fertility tracking, and date range
- Egg production breeding-line context from bird lineage or active mating period
- Incubation cycle foundation
- Incubation candle/lockdown/hatch reminders
- Incubation fertility and hatch-rate metrics
- Incubation visual timeline
- Feed inventory cups-on-hand and estimated inventory value
- Coop RTSP camera source field
- Internal go2rtc service for coop camera proxying
- Signed-in coop camera playback through the Covey API
- Named go2rtc stream registration for coop cameras
- Raw RTSP camera URLs hidden from browser coop records
- Breeding lines
- Pen mating periods
- Hen groups by mating period
- Incubation linkage to mating periods/breeding groups
- Hatch batch creation from completed incubations
- Optional auto-created chick records from hatch batches
- Homestead JSON export for backend-backed records
- Mobile chore mode foundation
- Mobile chore mode polish

## Next Slices

0. Product roadmap after prototype parity
   - [x] Mobile chore mode foundation
   - [x] Mobile chore mode polish
   - [x] Backup scheduler
   - [x] Audit/history page
   - [x] Custom tasks with calendar view and dismiss/complete history
   - [x] Bird and feed photos with storage, circular profile-style thumbnails, and permissions
   - [x] Health records for observations, medications, treatments, quarantine, and follow-up alerts
   - [x] Reporting page with filterable CSV exports
   - [x] Sales/revenue tracking for eggs, fertile eggs, birds, meat, and mating-period outcomes
   - [x] External calendar sync/iCal export for reminders and optional chores
   - [x] Bird variety/breed type profiles with per-type targets for process age, weight, egg goals, and breeder selection
   - [x] Printable report layouts and saved report presets
   - [x] Lightweight dated history for birds, coops, and mating periods
   - [x] Quick incident workflow for fights, separations, moves, and follow-up reminders
   - [ ] CSV export/import helpers for common tables
   - [ ] Inventory beyond feed
   - [ ] Breeding decision simulator

1. Breeding
   - [x] Line-level performance detail pages
   - [x] Breeding candidate and cull recommendation rules

2. Extend list/detail navigation
   - [x] Feed detail pages
   - [x] Incubation cycle detail pages
   - [x] Breeding line detail pages with mating periods and stats
   - [x] Mating period detail pages

3. Weight history and lineage
   - [x] Per-bird weight logs
   - [x] Age-based growth charts
   - [x] Hatch-date comparison
   - [x] Graphical ancestry/lineage tree

4. To Do and Recommendations
   - [x] Separate reminder tasks from advisory recommendations
   - [x] Sidebar badges from real pending counts
   - [x] Recommendation rules for processing/culling/breeding candidates

5. Camera playback polish
   - [x] Add camera overview page with selected coop multi-view
   - [x] Add MSE/WebRTC/MJPEG player mode options with MSE as the default
   - [x] Add stream health checks and camera unavailable states
   - [x] Add stronger go2rtc diagnostics for camera/codec/credential failures

6. ROI and value model
   - [x] Configurable egg/chick/meat values
   - [x] Lifetime feed cost
   - [x] Estimated bird value and color rating
   - [x] Compare mating period performance across fertility, hatch rate, growth, and value

7. User management hardening
   - [x] Invite/manage users
   - [x] Role-specific permissions
   - [x] Password reset token flow
   - [x] Optional MFA

8. Data migration and safety
   - [x] Backend homestead JSON export
   - [x] Prototype export/import preview
   - [x] Backend import with validation and dashboard total comparison

## Next Immediate Slice

CSV import helpers: add guided imports for common tables so bulk entry does not require hand-entering every bird, feed purchase, or egg log.
