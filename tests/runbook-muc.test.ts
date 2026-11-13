import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Số mục checklist trong runbook từng lệch (25–29 / 27–29 / 30 mục) vì mục được tách/gộp bằng tay.
 * Test này đếm bảng thật rồi đối chiếu mọi tham chiếu "mục N", "mục N–M", "(N mục)" và các dải số
 * trong §6/§9, để lần lệch sau đỏ ngay thay vì phải rà lại bằng mắt.
 */
const runbook = readFileSync(
  fileURLToPath(new URL('../docs/chang-4-runbook.md', import.meta.url)),
  'utf8',
)

const lines = runbook.split('\n')

/** Số mục trong các dòng bảng `| N |` của một đoạn văn bản. */
function itemNumbers(text: string): number[] {
  return [...text.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1]))
}

function section(prefix: string, endPrefix: string): string {
  const start = runbook.indexOf(prefix)
  expect(start, `không thấy mục "${prefix}" trong runbook`).toBeGreaterThanOrEqual(0)
  const rest = runbook.slice(start + prefix.length)
  const end = rest.indexOf(endPrefix)
  return end === -1 ? rest : rest.slice(0, end)
}

const checklist = section('## 6.', '## 7.')
const items = itemNumbers(checklist)
const total = items.length
const lastItem = items.at(-1) ?? 0

const cacheSection = checklist.slice(checklist.indexOf('### 6.5'))
const cacheItems = itemNumbers(cacheSection)

/** Dòng thuộc §6 hoặc §9 — nơi con số được hiểu là số mục checklist, không phải số liệu khác. */
function isChecklistSection(lineIndex: number): boolean {
  for (let i = lineIndex; i >= 0; i -= 1) {
    if (lines[i].startsWith('## ')) {
      return lines[i].startsWith('## 6.') || lines[i].startsWith('## 9.')
    }
  }
  return false
}

describe('runbook: số mục checklist', () => {
  it('bảng §6 đánh số liên tục từ 1, không thiếu không trùng', () => {
    expect(items.length).toBeGreaterThan(0)
    expect(items).toEqual(Array.from({ length: total }, (_, i) => i + 1))
  })

  it('§6.5 là khối cuối của checklist và liền mạch tới mục cuối', () => {
    expect(cacheItems.length).toBeGreaterThan(0)
    expect(cacheItems).toEqual(cacheItems.map((_, i) => cacheItems[0] + i))
    expect(cacheItems[0]).toBe(total - cacheItems.length + 1)
    expect(cacheItems.at(-1)).toBe(lastItem)
  })

  it('mọi "mục N" và "mục N–M" trỏ tới mục có thật', () => {
    // Bỏ qua "mục 7.0" / "mục 4B" (trỏ tới mục của tài liệu, không phải mục checklist).
    const refs = [...runbook.matchAll(/mục (\d+)(?:–(\d+))?(?![\d.A-Za-z])/g)]
    expect(refs.length).toBeGreaterThan(0)
    for (const [, from, to] of refs) {
      expect(items, `mục ${from} không tồn tại`).toContain(Number(from))
      if (to) {
        expect(items, `mục ${to} không tồn tại`).toContain(Number(to))
        expect(Number(from), `dải mục ${from}–${to} ngược`).toBeLessThanOrEqual(Number(to))
      }
    }
    // §5 mô tả cả khối §6.5 bằng một dải đầy đủ — dải đó phải đúng bằng khối thật.
    const ranges = refs.filter((r) => r[2]).map(([, from, to]) => [Number(from), Number(to)])
    expect(ranges).toContainEqual([cacheItems[0], lastItem])
  })

  it('mọi dải số trong §6/§9 khớp mục checklist', () => {
    const ranges = lines
      .filter((_, i) => isChecklistSection(i))
      .flatMap((line) => [...line.matchAll(/(\d+)–(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]))
    expect(ranges.length).toBeGreaterThan(0)
    for (const [from, to] of ranges) {
      expect(items, `dải ${from}–${to} vượt quá ${total} mục`).toContain(from)
      expect(items, `dải ${from}–${to} vượt quá ${total} mục`).toContain(to)
      expect(from).toBeLessThanOrEqual(to)
    }
    // Đoạn "Đã chạy local" gộp nhóm 404/503 + POST body thành một dải tới hết checklist;
    // mục 27 là mục 404 chung, mục đầu của nhóm. Lệch kiểu 27–29 (bỏ mục 30) sẽ đỏ ở đây.
    expect(ranges, `nhóm 404/503 + POST body phải là 27–${lastItem}`).toContainEqual([27, lastItem])
  })

  it('"(N mục)" khớp số mục thật', () => {
    const counts = [...runbook.matchAll(/\((\d+) mục\)/g)].map((m) => Number(m[1]))
    expect(counts.length).toBeGreaterThan(0)
    for (const n of counts) expect(n, `runbook ghi ${n} mục nhưng bảng có ${total}`).toBe(total)
  })
})
