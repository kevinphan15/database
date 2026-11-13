-- 0005_reference.sql — dữ liệu THAM CHIẾU của sản phẩm: miền, đài, sản phẩm, cơ cấu giải, lịch quay.
-- Không phải dữ liệu mẫu: không có kỳ quay nào, không có số trúng nào.
-- Thiếu mấy hàng này thì ingest trả 422 `unknown_station` và trang không có nhãn giải để render.
-- `INSERT OR IGNORE`: chạy lại không nhân đôi, và không ghi đè nếu vận hành đã sửa tay.
-- Chạy sau 0004 vì `schedule_rules.source_id` trỏ tới `sources`.

INSERT OR IGNORE INTO regions (code, name, slug) VALUES ('MN', 'Miền Nam', 'mien-nam');

INSERT OR IGNORE INTO stations
  (station_code, region_code, slug, name, short_name, status, redistribution_allowed, effective_from)
VALUES ('DONG_NAI', 'MN', 'dong-nai', 'Đồng Nai', 'ĐN', 'active', 0, '2026-01-01');

INSERT OR IGNORE INTO products (product_code, name, prize_rule_version)
VALUES ('xs-mn', 'Xổ số Miền Nam', 1);

-- Cơ cấu giải của xổ số kiến thiết Miền Nam (Đồng Nai): 9 giải, số chữ số cố định.
INSERT OR IGNORE INTO prize_rules (version, prize_code, label, ordinal, count, digits) VALUES
  (1, 'special', 'Giải Đặc Biệt', 1, 1, 6),
  (1, 'first',   'Giải Nhất',     2, 1, 5),
  (1, 'second',  'Giải Nhì',      3, 1, 5),
  (1, 'third',   'Giải Ba',       4, 2, 5),
  (1, 'fourth',  'Giải Tư',       5, 7, 5),
  (1, 'fifth',   'Giải Năm',      6, 1, 4),
  (1, 'sixth',   'Giải Sáu',      7, 3, 4),
  (1, 'seventh', 'Giải Bảy',      8, 1, 3),
  (1, 'eighth',  'Giải Tám',      9, 1, 2);

-- Đồng Nai quay thứ Tư (ISO 3) lúc 16:10 giờ VN, theo nguồn chính thức.
INSERT OR IGNORE INTO schedule_rules
  (station_code, product_code, iso_weekday, local_time, from_date, to_date, source_id)
VALUES ('DONG_NAI', 'xs-mn', 3, '16:10', '2026-01-01', NULL, 'src-official');
