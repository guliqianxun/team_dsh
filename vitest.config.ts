import { defineConfig } from 'vitest/config'
import { transform } from 'esbuild'

export default defineConfig({
  plugins: [{ name: 'task-ui-standard-decorators', enforce: 'pre', async transform(code, id) {
    // Vite's Oxc transform preserves standard decorators; match the Host's esbuild compilation.
    if (!id.endsWith('/src/tasks/api.ts')) return
    return transform(code, { loader: 'ts', target: 'es2022', sourcemap: 'inline', sourcefile: id })
  } }],
  test: { include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/*.test.mjs'] },
})
