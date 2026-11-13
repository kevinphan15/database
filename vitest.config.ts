import { getViteConfig } from 'astro/config';

// Cần plugin Astro để test import được file .astro qua AstroContainer.
export default getViteConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
