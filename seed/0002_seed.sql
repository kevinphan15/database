-- 0002_seed.sql — dữ liệu MẪU (fixture) cho đài thí điểm Đồng Nai.
-- Toàn bộ số dưới đây là GIẢ, dùng để kiểm thử render và các trạng thái kỳ.
-- Đặc điểm cố ý: có số 0 ở đầu (09, 007, 0123, 001234), có kỳ thiếu giải,
-- có ngày không có lịch quay (thứ Năm).

INSERT OR REPLACE INTO regions (code, name, slug) VALUES ('MN', 'Miền Nam', 'mien-nam');

INSERT OR REPLACE INTO stations
  (station_code, region_code, slug, name, short_name, status, redistribution_allowed, effective_from)
VALUES
  ('DONG_NAI', 'MN', 'dong-nai', 'Đồng Nai', 'ĐN', 'active', 0, '2026-01-01');

INSERT OR REPLACE INTO station_aliases (station_code, alias, from_date) VALUES
  ('DONG_NAI', 'XS Đồng Nai', '2026-01-01'),
  ('DONG_NAI', 'XSDN', '2026-01-01');

INSERT OR REPLACE INTO products (product_code, name, prize_rule_version) VALUES
  ('xs-mn', 'Xổ số Miền Nam', 1);

INSERT OR REPLACE INTO prize_rules (version, prize_code, label, ordinal, count, digits) VALUES
  (1, 'special', 'Giải Đặc Biệt', 1, 1, 6),
  (1, 'first',   'Giải Nhất',     2, 1, 5),
  (1, 'second',  'Giải Nhì',      3, 1, 5),
  (1, 'third',   'Giải Ba',       4, 2, 5),
  (1, 'fourth',  'Giải Tư',       5, 7, 5),
  (1, 'fifth',   'Giải Năm',      6, 1, 4),
  (1, 'sixth',   'Giải Sáu',      7, 3, 4),
  (1, 'seventh', 'Giải Bảy',      8, 1, 3),
  (1, 'eighth',  'Giải Tám',      9, 1, 2);

INSERT OR REPLACE INTO sources (source_id, name, kind, is_authoritative, rights_note, owner)
VALUES ('fixture-a', 'Nguồn mẫu (giả)', 'fixture', 0, 'Dữ liệu mẫu, không có giá trị thật', 'dev');

-- Đồng Nai quay thứ Tư (ISO 3). 2026-11-04 và 2026-11-11 là thứ Tư; 2026-11-12 là thứ Năm.
INSERT OR REPLACE INTO schedule_rules
  (station_code, product_code, iso_weekday, local_time, from_date, to_date, source_id)
VALUES ('DONG_NAI', 'xs-mn', 3, '16:10', '2026-01-01', NULL, 'fixture-a');

INSERT OR REPLACE INTO draws
  (draw_key, station_code, product_code, draw_date, period_code, status, confirmed_revision_id, rev, updated_at)
VALUES
  ('DONG_NAI:xs-mn:2026-11-04', 'DONG_NAI', 'xs-mn', '2026-11-04', '11/2026', 'confirmed', 1, 1, '2026-11-04T09:40:00Z'),
  ('DONG_NAI:xs-mn:2026-11-11', 'DONG_NAI', 'xs-mn', '2026-11-11', '11/2026', 'pending_confirmation', NULL, 1, '2026-11-11T09:45:00Z');

INSERT OR REPLACE INTO result_revisions
  (id, draw_key, kind, source_id, observed_at, source_updated_at, content_hash, prizes_json,
   prize_rule_version, is_correction, confirmed_by, note, created_at)
VALUES
  (1, 'DONG_NAI:xs-mn:2026-11-04', 'final', 'fixture-a', '2026-11-04T09:40:00Z', '2026-11-04T09:38:00Z',
   'fixture-dn-20261104', '{"special":["001234"],"first":["12345"],"second":["67890"],"third":["11111","22222"],"fourth":["33333","44444","55555","66666","77777","88888","99999"],"fifth":["0123"],"sixth":["0123","0456","0789"],"seventh":["007"],"eighth":["09"]}',
   1, 0, 'auto:authoritative', 'Dữ liệu mẫu đủ 9 giải', '2026-11-04T09:40:00Z'),
  (2, 'DONG_NAI:xs-mn:2026-11-11', 'final', 'fixture-a', '2026-11-11T09:45:00Z', '2026-11-11T09:44:00Z',
   'fixture-dn-20261111', '{"special":["009876"],"first":["54321"],"second":["09876"],"third":["10101","20202"],"fourth":["30303","30404","30505"],"fifth":["0567"],"sixth":["0001","0002","0003"],"seventh":["017"]}',
   1, 0, NULL, 'Dữ liệu mẫu: thiếu 4 số giải Tư và toàn bộ giải Tám', '2026-11-11T09:45:00Z');

INSERT OR REPLACE INTO settings (key, value) VALUES
  ('schema_version', '1'),
  ('publish_enabled', '1'),
  ('data_mode', 'fixture');

INSERT OR REPLACE INTO index_policy (pattern, from_date, enabled, note) VALUES
  ('/', NULL, 1, 'Trang chủ: index'),
  ('/xo-so-:region/', NULL, 1, 'Trang miền: index'),
  ('/xo-so-:region/:station/', NULL, 1, 'Trang đài: index'),
  ('/xo-so-:region/:station/:date/', NULL, 1, 'Trang ngày: index + self-canonical (kể cả hôm nay)'),
  ('/lich-mo-thuong/', NULL, 1, 'Lịch mở thưởng: index'),
  ('/so-ket-qua/', NULL, 1, 'Sổ kết quả: index'),
  ('/do-ve-so/', NULL, 1, 'Công cụ dò vé: index, kết quả POST không có URL'),
  ('/thong-ke/:metric/', NULL, 0, 'Thống kê: chỉ bật khi đủ dữ liệu và SEO duyệt');

-- URL cũ -> 301. Dòng dưới đây là mẫu để kiểm chứng middleware đọc bảng `redirects` từ D1
-- (không nằm trong bản đồ tĩnh của src/lib/redirects.ts).
INSERT OR REPLACE INTO redirects (old_path, new_path, status, created_at) VALUES
  ('/xo-so-dong-nai/', '/xo-so-mien-nam/dong-nai/', 301, '2026-11-12T00:00:00Z');
