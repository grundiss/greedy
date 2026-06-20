// Bundles the Electron main process + the embedded @greedy/api into a single
// self-contained ESM file (dist/main.js). This sidesteps Yarn-workspace symlink
// and ESM-resolution issues inside the packaged asar.
//
// Externals (NOT bundled, resolved from node_modules at runtime):
//   - electron            provided by the Electron runtime
//   - electron-updater    CJS; kept external and shipped in node_modules
//   - @electric-sql/pglite ships .wasm/.data assets → must stay on disk
//     (electron-builder `asarUnpack`s it)
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  // Electron 42 runs a modern Node; match it loosely.
  target: 'node20',
  outfile: 'dist/main.js',
  external: ['electron', 'electron-updater', '@electric-sql/pglite'],
  // Provide CJS globals to bundled CommonJS dependencies (fastify, drizzle, …)
  // that expect `require`/`__dirname`/`__filename` in an ESM output.
  banner: {
    js: [
      "import { createRequire as __cjsCreateRequire } from 'node:module';",
      "import { fileURLToPath as __cjsFileURLToPath } from 'node:url';",
      "import { dirname as __cjsDirname } from 'node:path';",
      'const require = __cjsCreateRequire(import.meta.url);',
      'const __filename = __cjsFileURLToPath(import.meta.url);',
      'const __dirname = __cjsDirname(__filename);',
    ].join('\n'),
  },
  logLevel: 'info',
});
