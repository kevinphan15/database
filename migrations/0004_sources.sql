-- 0004_sources.sql — nguồn dữ liệu THẬT đầu tiên (đài thí điểm Đồng Nai).
-- Chỉ metadata nguồn: không chứa số, không chứa lịch, không đụng công tắc vận hành.
-- `source_id` khớp với workflow n8n: `src-official` (bản final) và `src-live` (số đang về).
-- INSERT OR IGNORE để chạy lại không ghi đè nếu vận hành đã sửa tay.

INSERT OR IGNORE INTO sources (source_id, name, kind, is_authoritative, rights_note, owner)
VALUES (
    'src-official',
    'XSKT Đồng Nai — bảng kết quả chính thức',
    'official',
    1,
    'Website của đơn vị phát hành: https://xosodongnai.com.vn/ . Chỉ lấy bảng kết quả đã công bố; xác nhận lại điều khoản sử dụng lại bằng văn bản trước khi bật index.',
    'Công ty TNHH MTV Xổ số kiến thiết và Dịch vụ tổng hợp Đồng Nai'
  ),
  (
    'src-live',
    'XSKT Đồng Nai — tường thuật trong giờ quay',
    'scrape',
    0,
    'Cùng website đơn vị phát hành (https://xosodongnai.com.vn/), phần tường thuật trực tiếp: số live chỉ là tạm, phải chờ bản final xác nhận nên không đặt cờ authoritative.',
    'Công ty TNHH MTV Xổ số kiến thiết và Dịch vụ tổng hợp Đồng Nai'
  );
