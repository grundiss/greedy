// Bundles the Electron SHELL: the main process (dist/main.js, ESM) and the
// preload (dist/preload.cjs, CJS). The shell is static infrastructure — it does
// NOT bundle the app's backend (@greedy/api / fastify): that ships inside content
// bundles and is loaded dynamically at runtime (see scripts/build-content.mjs).
//
// Externals (NOT bundled, resolved from node_modules at runtime):
//   - electron             provided by the Electron runtime
//   - electron-updater     CJS; loaded only when shell auto-update is enabled
//   - @electric-sql/pglite ships .wasm/.data assets → must stay on disk
//     (electron-builder `asarUnpack`s it)
import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  external: ['electron', 'electron-updater', '@electric-sql/pglite'],
  logLevel: 'info',
};

// Main process — ESM. The CJS banner provides require/__dirname/__filename to
// bundled CommonJS deps (drizzle-orm, tar, …) that expect them.
await build({
  ...shared,
  entryPoints: ['src/main.ts'],
  format: 'esm',
  outfile: 'dist/main.js',
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
});

// Preload — CJS (.cjs so it loads regardless of the package "type": "module").
// Sandboxed; only touches electron's contextBridge/ipcRenderer.
await build({
  ...shared,
  entryPoints: ['src/preload.ts'],
  format: 'cjs',
  outfile: 'dist/preload.cjs',
});
