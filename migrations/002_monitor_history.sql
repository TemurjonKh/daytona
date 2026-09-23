CREATE TABLE check_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES opportunities(id),
 status text NOT NULL, note text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX check_history_opportunity_time ON check_history(opportunity_id,observed_at DESC);
ALTER TABLE opportunities ADD COLUMN accepted_snapshot_id uuid REFERENCES source_snapshots(id);
