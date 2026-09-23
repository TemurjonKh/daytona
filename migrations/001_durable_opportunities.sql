CREATE TABLE installations (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL REFERENCES installations(id),
 endpoint text NOT NULL UNIQUE, p256dh text NOT NULL, auth text NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL REFERENCES installations(id), identity_key text NOT NULL,
 title text NOT NULL, organization text, source_url text NOT NULL, kind text NOT NULL,
 due_at text, timezone text NOT NULL, confidence text NOT NULL, accepted_result jsonb,
 monitoring_enabled boolean NOT NULL DEFAULT false, monitoring_frequency text NOT NULL DEFAULT 'daily' CHECK (monitoring_frequency IN ('daily','weekly')),
 last_checked_at timestamptz, next_check_at timestamptz, last_check_status text, latest_content_hash text, latest_snapshot_id uuid,
 lease_until timestamptz, attempt_count integer NOT NULL DEFAULT 0, last_error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(installation_id,identity_key)
);
COMMENT ON COLUMN opportunities.due_at IS 'ISO date-only or offset-bearing instant; text preserves source precision without inventing midnight.';
CREATE INDEX opportunities_next_check ON opportunities(next_check_at) WHERE monitoring_enabled;
CREATE INDEX opportunities_installation ON opportunities(installation_id);
CREATE TABLE reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES opportunities(id), at timestamptz NOT NULL, label text NOT NULL,
 sent_at timestamptz, lease_until timestamptz, attempt_count integer NOT NULL DEFAULT 0, last_error_code text, next_attempt_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(opportunity_id,at)
);
CREATE INDEX reminders_due ON reminders(at) WHERE sent_at IS NULL;
CREATE TABLE source_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES opportunities(id), fetch_method text NOT NULL,
 text_slice text NOT NULL CHECK(length(text_slice)<=15000), content_hash text NOT NULL, extracted_result jsonb, observed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE opportunities ADD CONSTRAINT latest_snapshot_fk FOREIGN KEY(latest_snapshot_id) REFERENCES source_snapshots(id);
CREATE TABLE detected_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES opportunities(id), old_snapshot_id uuid REFERENCES source_snapshots(id),
 new_snapshot_id uuid NOT NULL REFERENCES source_snapshots(id), change_type text NOT NULL, old_value jsonb, new_value jsonb, explanation text NOT NULL,
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','accepted','dismissed')), idempotency_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE TABLE notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL REFERENCES installations(id), opportunity_id uuid NOT NULL REFERENCES opportunities(id),
 subscription_id uuid NOT NULL REFERENCES push_subscriptions(id), kind text NOT NULL CHECK(kind IN ('reminder','change')), ref_id uuid NOT NULL,
 idempotency_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','gone')),
 attempt_count integer NOT NULL DEFAULT 0, error_code text, attempted_at timestamptz, delivered_at timestamptz,
 lease_until timestamptz, next_attempt_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_pending ON notification_deliveries(next_attempt_at) WHERE status IN ('pending','failed');
