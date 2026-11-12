import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// SSR on-demand: không sinh file HTML cho từng ngày/đài (không tốn lưu trữ).
// Mọi trang render từ D1 mỗi request; static assets chỉ là CSS/ảnh.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    // Không dùng Cloudflare Images: tránh binding IMAGES và chi phí biến đổi ảnh.
    imageService: 'passthrough',
  }),
  trailingSlash: 'always',
  compressHTML: true,
  build: { inlineStylesheets: 'auto' },
  vite: {
    server: {
      // Hostname preview được cấp theo từng phiên (không hardcode vào repo).
      // Không dùng allowedHosts: true và không mở toàn bộ *.style.dev.
      allowedHosts: process.env.PREVIEW_HOSTS
        ? process.env.PREVIEW_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
        : [],
    },
  },
});
