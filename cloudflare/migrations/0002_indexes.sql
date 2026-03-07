-- IoRT-DT: Performance indexes for optimized fleet queries (migration 0002)
--
-- The fleet status route uses a derived-table join to fetch the latest state
-- vector per vehicle:
--
--   SELECT vehicle_id, MAX(id) AS max_id
--   FROM state_vectors
--   GROUP BY vehicle_id
--
-- This covering index lets SQLite resolve the GROUP BY entirely from the index
-- without a full table scan, giving O(log n) lookup per vehicle regardless of
-- total state_vector row count.

CREATE INDEX IF NOT EXISTS idx_state_vectors_vehicle_id
    ON state_vectors(vehicle_id, id);

-- Apply via:
--   wrangler d1 migrations apply FLEET_DB --env production
--   wrangler d1 migrations apply FLEET_DB --env staging
--   wrangler d1 migrations apply FLEET_DB --env dev
