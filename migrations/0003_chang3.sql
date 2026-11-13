-- 0003_chang3.sql — chỉ mục cho ingest/health. Chỉ schema, không chứa dữ liệu.
-- An toàn để chạy nhiều lần (IF NOT EXISTS) và an toàn để chạy trên D1 thật.
-- Dữ liệu mẫu nằm ở seed/fixture.sql; nguồn thật thêm bằng migration riêng (0004).

CREATE INDEX IF NOT EXISTS idx_draws_station_date ON draws (station_code, draw_date);
CREATE INDEX IF NOT EXISTS idx_draws_date ON draws (draw_date);
CREATE INDEX IF NOT EXISTS idx_revisions_draw ON result_revisions (draw_key, kind, observed_at);
CREATE INDEX IF NOT EXISTS idx_ingest_events_draw ON ingest_events (draw_key);
