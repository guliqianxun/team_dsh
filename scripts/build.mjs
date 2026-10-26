/** Clean and type-check both programs, then build the Host and DSH browser module. */
import { execFileSync } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { build } from 'esbuild'
import { transform } from 'lightningcss'

await rm('lib', { recursive: true, force: true })
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-b', '--force'], { stdio: 'inherit' })
await build({
  entryPoints: ['src/index.ts'], outfile: 'lib/index.js', platform: 'node', target: 'node22',
  format: 'esm', bundle: true, packages: 'external',
})
await build({
  entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js', platform: 'browser', target: 'es2022',
  format: 'cjs', bundle: true, jsx: 'automatic', minifyWhitespace: true,
  loader: { '.webp': 'dataurl' },
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-primitives'],
  plugins: [{ name: 'css-modules', setup(builder) {
    builder.onLoad({ filter: /\.module\.css$/ }, async ({ path }) => {
      const result = transform({ filename: path, code: await readFile(path), cssModules: { pattern: '[hash]_[local]' }, minify: true })
      const classes = Object.fromEntries(Object.entries(result.exports ?? {}).map(([key, value]) => [key, value.name]))
      return { loader: 'js', contents: `export default ${JSON.stringify(classes)}; export const cssText = ${JSON.stringify(result.code.toString())};` }
    })
  } }],
  banner: { js: 'window.__ModuleLoader__.load({ id: "team-dsh", factory: (require) => { var module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
})
await import('./check-artifacts.mjs')
