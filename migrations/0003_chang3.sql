-- 0003_chang3.sql — chỉ mục cho ingest/health + nguồn authoritative mẫu.
-- An toàn để chạy nhiều lần (IF NOT EXISTS / OR REPLACE).

CREATE INDEX IF NOT EXISTS idx_draws_station_date ON draws (station_code, draw_date);
CREATE INDEX IF NOT EXISTS idx_draws_date ON draws (draw_date);
CREATE INDEX IF NOT EXISTS idx_revisions_draw ON result_revisions (draw_key, kind, observed_at);
CREATE INDEX IF NOT EXISTS idx_ingest_events_draw ON ingest_events (draw_key);

-- Nguồn MẪU có quyền authoritative, chỉ dùng để kiểm thử luật A ở local.
-- Nguồn thật sẽ được chốt ở chặng 3/4 và thêm bằng migration riêng.
INSERT OR REPLACE INTO sources (source_id, name, kind, is_authoritative, rights_note, owner)
VALUES ('src-official', 'Nguồn chính thức (mẫu)', 'official', 1, 'Nguồn mẫu, không có giá trị thật', 'dev'),
       ('src-backup', 'Nguồn dự phòng (mẫu)', 'scrape', 0, 'Nguồn mẫu, không có giá trị thật', 'dev');
