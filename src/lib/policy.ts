/**
 * Luật index tập trung — một nguồn duy nhất cho <meta robots> và sitemap.
 * Trang ngày (kể cả hôm nay) LUÔN index + self-canonical; không dùng noindex cho trang ngày.
 */

export interface IndexDecision {
  index: boolean;
  follow: boolean;
  reason: string;
}

export type PageKind =
  | 'home'
  | 'region'
  | 'station'
  | 'date'
  | 'schedule'
  | 'ledger'
  | 'ticket-tool'
  | 'ticket-check'
  | 'guide'
  | 'stats';

export interface IndexContext {
  kind: PageKind;
  /** Ngày của kỳ (YYYY-MM-DD) với trang ngày. */
  drawDate?: string;
  /** Ngày hôm nay theo giờ VN. */
  today?: string;
  /** Trang ngày chỉ index khi đã có ít nhất một số. */
  hasPrizes?: boolean;
  /** Bật/tắt toàn cục (deploy tối, môi trường review). */
  indexEnabled?: boolean;
}

export function decideIndex(ctx: IndexContext): IndexDecision {
  const globalOn = ctx.indexEnabled !== false;

  if (!globalOn) {
    return { index: false, follow: false, reason: 'index tắt toàn cục (deploy tối / môi trường review)' };
  }

  switch (ctx.kind) {
    case 'ticket-check':
      return { index: false, follow: true, reason: 'kết quả dò vé không sinh URL index' };
    case 'ticket-tool':
      return { index: true, follow: true, reason: 'trang công cụ dò vé' };
    case 'stats':
      return { index: false, follow: true, reason: 'thống kê chỉ bật khi đủ dữ liệu và được duyệt' };
    case 'date':
      if (!ctx.hasPrizes) {
        return { index: false, follow: true, reason: 'trang ngày chưa có số nào' };
      }
      return { index: true, follow: true, reason: 'trang ngày: index + self-canonical' };
    default:
      return { index: true, follow: true, reason: 'trang nội dung chính' };
  }
}

/** Giá trị cho <meta name="robots">. */
export function robotsContent(decision: IndexDecision): string {
  const index = decision.index ? 'index' : 'noindex';
  const follow = decision.follow ? 'follow' : 'nofollow';
  return `${index}, ${follow}`;
}
