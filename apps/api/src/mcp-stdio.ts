import 'reflect-metadata';
import { createRequire } from 'node:module';
// stdout carries JSON-RPC frames: route every log line to stderr before anything else loads.
console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);

import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CoreModule } from './core.module';
import { ApiKeysService } from './modules/mcp/api-keys.service';
import { ScopeToolsService } from './modules/mcp/scope-tools.service';
import { stdioToolContext } from './modules/mcp/tool-context';
import { xmcpStdioPath } from './modules/mcp/xmcp-adapter';

@Module({ imports: [CoreModule] })
class McpStdioModule {}

/**
 * Local MCP server over stdio (Claude Desktop, Cursor, Claude Code, MCP Inspector).
 * Runs the same tools in-process against DATABASE_URL, acting as the owner of SCOPEPROFIT_API_KEY.
 */
async function main() {
  const raw = process.env.SCOPEPROFIT_API_KEY;
  if (!raw) throw new Error('SCOPEPROFIT_API_KEY is required (create one with `mcp:keys create`)');
  const app = await NestFactory.createApplicationContext(McpStdioModule, { logger: ['error'] });
  const { user } = await app.get(ApiKeysService).verify(raw);

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.stdin.on('close', () => void shutdown());
  stdioToolContext.provider(
    {
      tools: app.get(ScopeToolsService),
      user,
      authenticate: async () => (await app.get(ApiKeysService).verify(raw)).user,
    },
    () => createRequire(__filename)(xmcpStdioPath),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
