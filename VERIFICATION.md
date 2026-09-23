# Durable monitoring verification — 2026-09-23

Known starting state matched the supplied review at a7c2881. No database, ORM, tests or runner existed; browser and server memory held state. The existing extraction, grounding and Daytona escalation were retained.

| Check | Baseline | Milestone A | Final |
| --- | --- | --- | --- |
| ESLint | 4 errors, 0 warnings | 3 errors, 0 warnings | 3 errors, 0 warnings |
| TypeScript | 0 errors | 0 errors | 0 errors |
| Production build | PASS, 0 errors | PASS, 0 errors | PASS, 0 errors |
| Tests | No runner or tests | 13 passed, 0 failed (2 files) | 37 passed, 0 failed (5 files) |

Remaining lint errors are the existing effect and two render-time Date.now calls in OpportunityResult.tsx. The page effect error disappeared as part of replacing localStorage state. No unrelated lint suppression or fixes were introduced.

## Migrations and durability

001 creates installations, subscriptions, opportunities, reminders, snapshots, changes and per-device deliveries. Indexes cover opportunity installation and due monitoring, unsent reminders, and pending deliveries; identity, opportunity/reminder time, endpoint and idempotency constraints enforce uniqueness. 002 adds check_history with opportunity/time index and an accepted-snapshot foreign key. Migrations are additive and execute in transactions using the same SQL in PGlite and PostgreSQL.

Reminders use two-minute leases and monitoring six-minute leases. Atomic SKIP LOCKED claims prevent overlapping workers. Retries use exponential delays and terminal attempt limits. Unprocessed reminder claims are released without consuming attempts. Change and per-device delivery keys prevent new duplicate database records; stable push tags mitigate crash-after-receipt transport ambiguity.

## Fixtures actually run

- Unchanged normalized hash: 0 extraction calls, 0 changes, 0 pushes after baseline.
- Changed grounded deadline: 1 pending change, 2 delivery calls for 2 subscriptions. Accepted result and due date remain untouched until review.
- Same source recheck: 0 additional deliveries. Accept changes 2030-10-05 to 2030-10-12 and generates 2030-10-09T00:00:00Z and 2030-10-11T00:00:00Z reminders for Asia/Seoul. A subsequent tick adds 0 deliveries.
- Transaction failure during reminder insertion rolls back accepted-result update and reminder deletion.
- Cross-installation opportunity and change routes return 404; browser mutations require Origin. Tick needs only its Bearer token and rejects missing/wrong/unset credentials.
- Legacy import, lease expiry, three-failure reset, per-device retries, 410 deactivation, baseline suppression, date omission/conflict/inferred-year guards, timezone DST behavior, grounding, cleanup and orphan filtering passed offline.

## Live checks actually run

The production server started and was stopped after HTTP checks: / and /sw.js returned 200; unauthenticated /api/internal/tick returned 401; /api/opportunities returned the expected 503 with DATABASE_URL missing.

Two live GitHub Chromium renders passed (the second retained evidence because the first runner omitted its console log). Recorded cleanup:

```json
{"stage":"sandbox_deleted","status":"completed","sandboxId":"49753cdf-628e-48fc-a5c1-f97962d600dd"}
```

These checked real Daytona browser rendering and deletion, not a live OpenAI-backed database monitoring run. No paid OpenAI calls were made. Luma reachability was not claimed or changed.

Final scan: zero actual credential matches in tracked/new source and zero secret-name/value matches in .next/static. .env.local remains ignored and untracked.

## Unverified and activation requirements

DATABASE_URL, CRON_SECRET and VAPID_SUBJECT are not configured locally. Live PostgreSQL migrations/restart persistence, deployed scheduler execution and production push transport remain unverified. PGlite persistence and delivery transport mocks passed. No scheduler or deployment was created.

The route requests 300 seconds; actual Vercel plan/function settings are unverified. Concurrency and batch size are one. Start only with 270 seconds remaining: original 190-second check estimate plus 60-second cleanup and 20-second overhead. SDK stage timeouts shrink to reserve cleanup and extraction time. Do not activate production cron before verifying this duration. Cron plan timing limitations are documented in README.

Next: configure PostgreSQL, migrate, verify restart persistence and deployed duration, then configure authenticated scheduling and test real push. Grounding month/day validation and DNS-rebinding hardening remain explicitly deferred follow-ups.
