# Opportunity Agent

Grounded URL and poster extraction with persistent opportunities and reminders.

## Database and local development

Use PostgreSQL, copy `.env.example` to ignored `.env.local`, and fill the variables securely. `DATABASE_URL` is required; there is no in-memory fallback. Set `VAPID_SUBJECT` to an appropriate `mailto:` contact or HTTPS URL and keep the existing VAPID pair.

```sh
npm install
npm run migrate
npm run dev
npm test
npm run build
```

Numbered SQL migrations are additive and tracked in `schema_migrations`; each file runs in a transaction. Tests use the same SQL through PGlite, never a production database. Source date-only values stay date-only; reminder instants use timestamptz.

## Identity, storage, and legacy import

An HttpOnly installation cookie scopes all data. No accounts are added. Clearing that cookie loses access to that installation's saved data. Opportunities, subscriptions, per-device deliveries, and reminders live in PostgreSQL. The browser's old `deadline-events` array is imported once, retained locally, and never used as the current source of truth. Partial invalid imports report indexes; repeated imports are harmless.

## Tick endpoint setup

Configure a long random `CRON_SECRET`. Nothing in this repository activates a scheduler automatically.

```sh
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://YOUR-DOMAIN/api/internal/tick
```

Vercel's cron configuration may call GET with the same Bearer secret. Example for Hobby, to place in `vercel.json` only when deploying:

```json
{"crons":[{"path":"/api/internal/tick","schedule":"0 9 * * *"}]}
```

Hobby cron runs once a day and can fire at any minute in its scheduled hour: reminders can be about 24 hours late. Timely reminders require Pro's every-minute cron (`* * * * *`) or an external scheduler every 1–5 minutes. Runs can be skipped or duplicated. SQL leases prevent concurrent claims; per-device idempotency keys preserve successful deliveries across retries. Network receipt followed by a process crash cannot provide mathematically exactly-once transport; stable notification tags prevent duplicate visible cards where supported.

The route requests a 300-second function limit, supported by Vercel Fluid Compute. Verify your actual deployment settings before scheduling; they have not been verified here. Reminder processing in a tick is bounded to 20 seconds with 2-minute claims and three attempts, using exponential retry delays. TTL is 12 hours. Missing database configuration fails loudly.

## Known limitations

No scheduler or production database is configured by these instructions. Check your hosting plan's execution limits and upload limits. Daytona outbound networking depends on organization policy. Browser push requires HTTPS and notification permission after saving. Lost installation cookies have no account recovery. The live scheduler must be configured separately.

[Function limits](https://vercel.com/docs/functions/limitations) · [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## Monitoring and check now

Save a real extraction, select it in Upcoming, and enable daily or weekly monitoring. Posters cannot be monitored. Check now uses the same lease and pipeline, at most once per ten minutes. Exact 15,000-character model slices are stored; normalized hashes skip extraction when unchanged. Baselines do not notify. Imported records require baseline review before accepting evidence. Changed dates and explicit requirements create pending reviews; accepting a snapshot updates the full result and regenerates unsent reminders in the stored IANA timezone. Dismiss keeps the current result. Sent reminder tombstones remain.

Only structured material differences notify. Label/summary/task changes do not. Ambiguous date matches and inferred years are history-only; an omitted date whose old quote remains does not become a removal. Both conflicting quotes produce conflict review. Each notification has one durable delivery record per device; retries skip terminal deliveries. Pending change delivery is retried by tick even if a process stopped before sending.

The tick requests 300 seconds, claims at most one monitoring job, and uses concurrency 1. Original worst-case check estimate: creation 60 + driver install 45 + render 40 + extraction 45 = 190 seconds; reserve 60 more for cleanup and 20 for fetch/dispatch (270 seconds). Tick only starts a check with at least 270 seconds remaining. Browser stages shorten their SDK timeouts as the budget expires, reserving 110 seconds for cleanup/extraction; a failed check is retried later, not run past its budget. Interactive fallback retains its existing snapshot/default/image order. Actual hosting duration is UNVERIFIED: do not enable production cron until the deployed function supports this budget. No scheduler is configured by this change.

Opportunity leases last six minutes (longer than the requested function duration). Failures back off one then two minutes; after the third failure the attempt count resets and the next daily/weekly cycle is scheduled. Checks never replace accepted dates or reminders. Login/unavailable error codes have plain-English UI mappings; failures without a reliable HTTP classification use the generic message.

## Daytona snapshot and orphan recovery

Set `DAYTONA_SNAPSHOT` to an active snapshot with Chromium and Playwright tooling (default `opportunity-worker`). Verify its active state/tooling in Daytona and run a check; structured logs contain only sandbox ID, start time, outcome and cleanup state. SDK deletion is awaited by monitoring, bounded at 60 seconds; interactive success uses Next `after`. Errors await cleanup. Cleanup failure is logged as `sandbox_cleanup_failed` without discarding a successful extraction. Auto-stop after five minutes and auto-delete after stopping remain the crash backstop.

```sh
npm run daytona:orphans
npm run daytona:orphans -- --delete
```

The first command lists only `project=deadline` sandboxes older than 15 minutes. The second explicitly deletes those; inspect the list before deleting because another live process could still own a sandbox. This is not wired into cron.

## Inspect and retry failed checks

Use a private SQL console; scope queries to the installation and opportunity you intend to inspect. Do not expose database credentials or source text in public logs.

```sql
SELECT id,last_check_status,attempt_count,last_checked_at,next_check_at,last_error_code
FROM opportunities WHERE installation_id = '<installation-uuid>'
AND last_check_status = 'failed';

UPDATE opportunities SET attempt_count=0,next_check_at=now(),updated_at=now()
WHERE installation_id='<installation-uuid>' AND id='<opportunity-uuid>'
AND monitoring_enabled AND (lease_until IS NULL OR lease_until<now());
```

Existing leases still prevent concurrent work. `check_history` retains failed and ignored checks; `detected_changes` retains pending/accepted/dismissed reviews. Unchanged checks are not listed. Migration 002 adds the history table/index and an accepted-snapshot reference so review evidence does not drift with later checks.

## Verification boundaries

Offline tests mock OpenAI, Daytona and push transport while executing the production SQL against PGlite. Live PostgreSQL restart persistence requires `DATABASE_URL`; no fallback is provided. VAPID keys must remain the same pair, with `VAPID_SUBJECT` configured. Exact transport-once delivery cannot be guaranteed across a crash after remote receipt and before database acknowledgement. Installation cookies are bearer credentials; there is no cross-device account recovery. Existing grounding checks only the year against quotes; month/day validation, DNS rebinding hardening and investigation rate limits remain follow-ups.
