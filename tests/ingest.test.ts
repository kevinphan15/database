import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  contentHashOf,
  decideIngest,
  drawKey,
  parseObservation,
  requestHashOf,
  type DecisionInput,
  type DrawState,
  type Observation,
  type RevisionRef,
} from '../src/lib/ingest';

const HASH_A = 'hash-a';
const HASH_B = 'hash-b';

function obs(over: Partial<Observation> = {}): Observation {
  return {
    station_code: 'DONG_NAI',
    product_code: 'xs-mn',
    draw_date: '2026-11-18',
    kind: 'final',
    source_id: 'src-a',
    prizes: { special: ['123456'], seventh: ['007'] },
    observed_at: '2026-11-18T09:45:00Z',
    ...over,
  };
}

function revision(over: Partial<RevisionRef> = {}): RevisionRef {
  return {
    id: 1,
    kind: 'final',
    source_id: 'src-a',
    content_hash: HASH_A,
    observed_at: '2026-11-18T09:45:00Z',
    ...over,
  };
}

function decide(over: Partial<DecisionInput> = {}) {
  return decideIngest({
    observation: obs(),
    contentHash: HASH_A,
    sourceAuthoritative: false,
    current: null,
    revisions: [],
    publishEnabled: true,
    ...over,
  });
}

const confirmed: DrawState = { status: 'confirmed', confirmed_revision_id: 1, rev: 2 };

describe('parseObservation', () => {
  it('chấp nhận payload hợp lệ và giữ số 0 ở đầu', () => {
    const result = parseObservation(obs());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.prizes.seventh).toEqual(['007']);
      expect(result.value.prize_rule_version).toBe(1);
    }
  });

  it('từ chối ngày không tồn tại trên lịch', () => {
    const result = parseObservation(obs({ draw_date: '2026-02-30' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/draw_date/);
  });

  it('từ chối số gửi dạng number thay vì chuỗi', () => {
    const result = parseObservation({ ...obs(), prizes: { special: [123456] } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/chuỗi 2\.\.6 chữ số/);
  });

  it('từ chối timestamp không phải UTC', () => {
    const result = parseObservation(obs({ observed_at: '2026-11-18T09:45:00+07:00' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/observed_at/);
  });

  it('từ chối prizes rỗng và kind lạ', () => {
    const result = parseObservation({ ...obs(), prizes: {}, kind: 'partial' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const text = result.errors.join(' ');
      expect(text).toMatch(/prizes phải có ít nhất một giải/);
      expect(text).toMatch(/kind/);
    }
  });

  it('từ chối payload không phải object', () => {
    expect(parseObservation([1, 2]).ok).toBe(false);
    expect(parseObservation('x').ok).toBe(false);
  });
});

describe('hash', () => {
  it('canonicalJson sắp xếp khoá', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('contentHash không phụ thuộc thứ tự khoá', async () => {
    const one = await contentHashOf({ special: ['123456'], first: ['12345'] });
    const two = await contentHashOf({ first: ['12345'], special: ['123456'] });
    expect(one).toBe(two);
    const three = await contentHashOf({ special: ['123456'], first: ['54321'] });
    expect(three).not.toBe(one);
  });

  it('requestHash ổn định cho cùng payload', async () => {
    expect(await requestHashOf(obs())).toBe(await requestHashOf(obs()));
    expect(await requestHashOf(obs())).not.toBe(await requestHashOf(obs({ source_id: 'src-b' })));
  });

  it('requestHash bỏ qua observed_at/source_updated_at để retry vẫn là duplicate', async () => {
    const first = await requestHashOf(obs({ observed_at: '2026-11-18T09:45:00Z' }));
    const retry = await requestHashOf(
      obs({ observed_at: '2026-11-18T09:59:00Z', source_updated_at: '2026-11-18T09:58:00Z' }),
    );
    expect(retry).toBe(first);
  });

  it('requestHash vẫn đổi khi nội dung số đổi', async () => {
    const first = await requestHashOf(obs());
    const other = await requestHashOf(obs({ prizes: { special: ['999999'] } }));
    expect(other).not.toBe(first);
  });

  it('drawKey đúng định dạng', () => {
    expect(drawKey(obs())).toBe('DONG_NAI:xs-mn:2026-11-18');
  });
});

describe('luật A — decideIngest', () => {
  it('từ chối khi xuất bản đang tắt', () => {
    const decision = decide({ publishEnabled: false });
    expect(decision.action).toBe('reject_publish_disabled');
    expect(decision.httpStatus).toBe(423);
  });

  it('live đầu tiên đưa kỳ sang live', () => {
    const decision = decide({ observation: obs({ kind: 'live' }) });
    expect(decision.action).toBe('live');
    expect(decision.status).toBe('live');
  });

  it('live đến sau final không hạ trạng thái', () => {
    const afterPending = decide({
      observation: obs({ kind: 'live' }),
      current: { status: 'pending_confirmation', confirmed_revision_id: null, rev: 1 },
      revisions: [revision()],
    });
    expect(afterPending.action).toBe('ignore_downgrade');
    expect(afterPending.status).toBeNull();

    const afterConfirmed = decide({
      observation: obs({ kind: 'live' }),
      current: confirmed,
      revisions: [revision()],
    });
    expect(afterConfirmed.action).toBe('ignore_downgrade');
    expect(afterConfirmed.status).toBeNull();
  });

  it('một nguồn thường: hiện số nhưng chưa xác nhận', () => {
    const decision = decide();
    expect(decision.action).toBe('pending_confirmation');
    expect(decision.status).toBe('pending_confirmation');
    expect(decision.confirmedBy).toBeNull();
  });

  it('nguồn authoritative: xác nhận ngay', () => {
    const decision = decide({ sourceAuthoritative: true });
    expect(decision.action).toBe('confirm');
    expect(decision.status).toBe('confirmed');
    expect(decision.confirmedBy).toBe('auto:authoritative');
    expect(decision.confirmedHash).toBe(HASH_A);
  });

  it('hai nguồn trùng hash: tự xác nhận', () => {
    const decision = decide({
      observation: obs({ source_id: 'src-b' }),
      current: { status: 'pending_confirmation', confirmed_revision_id: null, rev: 1 },
      revisions: [revision()],
    });
    expect(decision.action).toBe('confirm_dual_source');
    expect(decision.confirmedBy).toBe('auto:dual-source');
    expect(decision.status).toBe('confirmed');
  });

  it('hai bản final khác hash: disputed, không xác nhận', () => {
    const decision = decide({
      observation: obs({ source_id: 'src-b' }),
      current: { status: 'pending_confirmation', confirmed_revision_id: null, rev: 1 },
      revisions: [revision({ content_hash: HASH_B })],
    });
    expect(decision.action).toBe('dispute');
    expect(decision.status).toBe('disputed');
    expect(decision.confirmedHash).toBeNull();
  });

  it('trùng bản đã xác nhận: không ghi gì', () => {
    const decision = decide({
      current: confirmed,
      revisions: [revision({ content_hash: HASH_A })],
    });
    expect(decision.action).toBe('unchanged');
    expect(decision.httpStatus).toBe(200);
    expect(decision.status).toBeNull();
  });

  it('nguồn authoritative đính chính bản đã công bố', () => {
    const decision = decide({
      sourceAuthoritative: true,
      current: confirmed,
      revisions: [revision({ content_hash: HASH_B })],
    });
    expect(decision.action).toBe('correction');
    expect(decision.isCorrection).toBe(true);
    expect(decision.status).toBe('confirmed');
    expect(decision.confirmedHash).toBe(HASH_A);
  });

  it('nguồn thường lệch hash khi đã công bố: disputed, giữ bản cũ', () => {
    const decision = decide({
      current: confirmed,
      revisions: [revision({ content_hash: HASH_B })],
    });
    expect(decision.action).toBe('dispute');
    expect(decision.status).toBe('disputed');
    expect(decision.confirmedHash).toBeNull();
  });

  it('chính nguồn đó gửi lại bản khác hash: vẫn chờ đối soát', () => {
    const decision = decide({
      current: { status: 'pending_confirmation', confirmed_revision_id: null, rev: 1 },
      revisions: [revision({ content_hash: HASH_B })],
    });
    expect(decision.action).toBe('pending_confirmation');
  });

  it('kỳ disputed chưa từng xác nhận, nguồn authoritative đến thì xác nhận', () => {
    const decision = decide({
      sourceAuthoritative: true,
      current: { status: 'disputed', confirmed_revision_id: null, rev: 2 },
      revisions: [revision({ content_hash: HASH_B }), revision({ id: 2, source_id: 'src-b', content_hash: 'hash-c' })],
    });
    expect(decision.action).toBe('confirm');
    expect(decision.status).toBe('confirmed');
  });
});
