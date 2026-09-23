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

The route requests a 300-second function limit, supported by Vercel Fluid Compute. Verify your actual deployment settings before scheduling; they have not been verified here. Reminder processing is bounded to 45 seconds with 2-minute claims and three attempts, using exponential retry delays. TTL is 12 hours. Missing database configuration fails loudly.

## Known limitations

No scheduler or production database is configured by these instructions. Check your hosting plan's execution limits and upload limits. Daytona outbound networking depends on organization policy. Browser push requires HTTPS and notification permission after saving. Lost installation cookies have no account recovery. The live scheduler must be configured separately.

[Function limits](https://vercel.com/docs/functions/limitations) · [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
