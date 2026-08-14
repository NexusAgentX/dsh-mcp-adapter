import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const result = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  write: false,
  jsx: 'automatic',
  target: 'es2022',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-runtime/client',
    '@deepseek-ai/dsh-client-ui-tool',
    '@deepseek-ai/dsh-client-ui-tool/client',
    '@deepseek-ai/dsh-client-ui-commands',
    '@deepseek-ai/dsh-client-ui-commands/client',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-locale/client',
  ],
})

const code = result.outputFiles?.[0]?.text
if (!code) throw new Error('esbuild produced no client bundle')

const wrapped = `window.__ModuleLoader__.load({
	id: "dsh-mcp-adapter",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${code}
		return module.exports;
	}
});
`

mkdirSync(join(root, 'dist'), { recursive: true })
writeFileSync(join(root, 'dist/client.js'), wrapped)
console.log('wrote dist/client.js')
