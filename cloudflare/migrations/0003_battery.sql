-- Phase 3.5: carry battery from the 47-byte frame through to the dashboard.
-- battery_pct (0-100) powers the Point-of-No-Return safety engine.
ALTER TABLE state_vectors ADD COLUMN battery_pct REAL;
