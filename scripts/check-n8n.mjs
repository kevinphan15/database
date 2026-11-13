/**
 * Kiểm tra mọi file n8n/*.json parse được bằng JSON.parse.
 * Cả 4 workflow từng bị hỏng cú pháp (một dấu `\` thừa trong trường `url`) mà không ai phát hiện
 * vì JSON hỏng chỉ lộ ra lúc import vào n8n. Chạy ở CI và trước khi import tay.
 */

import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../n8n/', import.meta.url);
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error('✗ Không có file .json nào trong n8n/');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  try {
    JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    console.log(`✓ ${file}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed}/${files.length} workflow không phải JSON hợp lệ.`);
  process.exit(1);
}

console.log(`\n${files.length} workflow đều là JSON hợp lệ.`);
