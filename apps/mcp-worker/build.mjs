#!/usr/bin/env node
/**
 * Builds the MCP worker bundle. Reuses the api's domain services with build-time
 * substitutions for everything that cannot run on Cloudflare Workers:
 *   package aliases: @nestjs/common, xmcp, sharp, pele, @resvg/resvg-js,
 *                    @prisma/client (workerd generated client), pdfkit (standalone build),
 *                    @scopeprofit/contracts (source)
 *   path redirects (relative imports inside apps/api/src):
 *     prisma.service.ts      -> src/shims/prisma.ts (Neon serverless adapter)
 *     storage.service.ts     -> src/shims/r2-storage.ts (R2 bucket)
 *     image-fetch.ts         -> src/shims/image-fetch.ts (fetch-based)
 *     agent/agent.service.ts -> src/shims/agent-stub.ts (enqueue only; no LangGraph)
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shim = (name) => join(here, 'src/shims', name);

const redirects = new Map(
  Object.entries({
    'apps/api/src/prisma.service.ts': shim('prisma.ts'),
    'apps/api/src/modules/storage/storage.service.ts': shim('r2-storage.ts'),
    'apps/api/src/modules/mcp/image-fetch.ts': shim('image-fetch.ts'),
    'apps/api/src/modules/agent/agent.service.ts': shim('agent-stub.ts'),
  }).map(([from, to]) => [resolve(here, '../..', from), to]),
);

const NODE_BUILTINS = [
  'assert', 'async_hooks', 'buffer', 'crypto', 'diagnostics_channel', 'events', 'fs', 'http',
  'http2', 'https', 'net', 'os', 'path', 'process', 'querystring', 'stream', 'string_decoder',
  'tls', 'tty', 'url', 'util', 'worker_threads', 'zlib',
];

/** ESM re-export shims for bare node builtins: converts CJS require('buffer') into
 * bundled modules whose node: imports stay native (workerd rejects dynamic require). */
const BUILTIN_SHIM_DIR = join(here, '.build-shims');
mkdirSync(BUILTIN_SHIM_DIR, { recursive: true });
const builtinAliases = Object.fromEntries(
  NODE_BUILTINS.map((name) => {
    const file = join(BUILTIN_SHIM_DIR, `${name.replace(/\//g, '_')}.ts`);
    writeFileSync(
      file,
      `export * from 'node:${name}';\nimport * as ns from 'node:${name}';\nexport default ns;\n`,
    );
    return [name, file];
  }),
);


/** Redirects absolute resolved paths of reused api sources to their worker replacements. */
const pathSubstitutions = {
  name: 'scopeprofit-path-substitutions',
  setup(buildApi) {
    // Route 'node:<builtin>' imports (except from the shims themselves) through the
    // ESM shims so CJS require('node:zlib') also becomes a bundled module.
    buildApi.onResolve({ filter: /^node:/ }, (args) => {
      if (args.importer.startsWith(BUILTIN_SHIM_DIR)) return { external: true };
      const name = args.path.slice(5);
      if (NODE_BUILTINS.includes(name))
        return { path: join(BUILTIN_SHIM_DIR, `${name.replace(/\//g, '_')}.ts`) };
      return undefined;
    });
    buildApi.onResolve({ filter: /.*/ }, async (args) => {
      if (!args.importer) return undefined;
      const target = resolve(args.resolveDir, args.path);
      const redirected = redirects.get(target);
      if (redirected) return { path: redirected };
      return undefined;
    });
    // Exact-match swap of the generated Prisma client (subpaths keep the real package).
    buildApi.onResolve({ filter: /^@prisma\/client$/ }, () => ({
      path: join(here, 'src/generated/prisma/client.ts'),
    }));
    // The workerd client embeds its query-compiler wasm as a module; keep it external so
    // wrangler loads it as a CompiledWasm module from dist/.
    buildApi.onResolve({ filter: /query_engine_bg\.wasm\?module$/ }, (args) => ({
      path: `./query_engine_bg.wasm?module`,
      external: true,
    }));
  },
};

import { copyFileSync } from 'node:fs';

const result = await build({
  entryPoints: [join(here, 'src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['browser', 'module', 'main'],
  conditions: ['workerd', 'worker', 'browser'],
  target: 'es2022',
  outfile: join(here, 'dist/worker.js'),
  sourcemap: false,
  minify: true,
  logLevel: 'info',
  external: ['node:*', 'cloudflare:*'],
  alias: {
    ...builtinAliases,
    '@nestjs/common': shim('nestjs-common.ts'),
    express: shim('express.ts'),
    xmcp: shim('xmcp.ts'),
    sharp: shim('sharp.ts'),
    pele: shim('pele.ts'),
    '@resvg/resvg-js': shim('resvg.ts'),
    '@scopeprofit/contracts': join(here, '../../packages/contracts/src/index.ts'),
    pdfkit: join(here, 'node_modules/pdfkit/js/pdfkit.standalone.js'),
  },
  plugins: [pathSubstitutions],
  metafile: true,
});

mkdirSync(join(here, 'dist'), { recursive: true });
copyFileSync(
  join(here, 'src/generated/prisma/internal/query_engine_bg.wasm'),
  join(here, 'dist/query_engine_bg.wasm'),
);
const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`worker bundle: ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
