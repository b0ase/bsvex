import { defineConfig } from 'vitest/config'

// css.postcss: {} stops Vite from picking up the Next.js site's postcss config one level up.
export default defineConfig({ css: { postcss: {} }, test: { include: ['test/**/*.test.ts'] } })
