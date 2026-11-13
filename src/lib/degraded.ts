/**
 * Câu chữ và luật index dùng chung cho trạng thái "D1 lỗi truy vấn" (khác với D1 rỗng).
 * Một chỗ duy nhất để trang miền/đài/ngày, banner và API không lệch nhau.
 */

import type { IndexDecision } from './policy';

/** Banner trong layout. */
export const DATA_UNAVAILABLE_NOTICE =
  'Tạm thời chưa tải được dữ liệu kết quả. Trang đang để trống, vui lòng thử lại sau ít phút.';

export const DATA_UNAVAILABLE_TITLE = 'Tạm thời chưa tải được dữ liệu';

export const DATA_UNAVAILABLE_DESCRIPTION =
  'Hệ thống tạm thời không đọc được dữ liệu kết quả. Vui lòng thử lại sau ít phút.';

/** Câu thay cho các câu "chưa có dữ liệu" ở trang nội dung — tránh khẳng định sai khi D1 lỗi. */
export const DATA_UNAVAILABLE_EMPTY = 'Chưa tải được dữ liệu. Vui lòng thử lại sau ít phút.';

/** Trang lỗi tạm thời không được index và không phát canonical. */
export const DATA_UNAVAILABLE_DECISION: IndexDecision = {
  index: false,
  follow: true,
  reason: 'D1 lỗi truy vấn, trang tạm không có dữ liệu',
};
