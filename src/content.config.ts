import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Bài biên tập bắt buộc có nguồn và ngày rà soát.
 * Thiếu `source_url` hoặc `reviewed_at` → build FAIL, không thể phát hành bài chưa kiểm nguồn.
 */
const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/huong-dan' }),
  schema: z.object({
    title: z.string().min(10),
    description: z.string().min(20),
    source_url: z.string().url(),
    reviewed_at: z.coerce.date(),
    order: z.number().default(0),
  }),
});

export const collections = { guides };
