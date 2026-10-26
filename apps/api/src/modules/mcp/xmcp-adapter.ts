import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Request, Response } from 'express';

interface ScopeAdapter {
  XmcpService: new () => { handleRequest(req: Request, res: Response): Promise<void> };
}

const generatedRoot = existsSync(resolve(__dirname, '../../../.xmcp/adapter/adapter.js'))
  ? resolve(__dirname, '../../../.xmcp/adapter')
  : resolve(__dirname, '../../../../.xmcp/adapter');

const loadAdapter = createRequire(__filename);
export const xmcpAdapter = loadAdapter(resolve(generatedRoot, 'adapter.js')) as ScopeAdapter;
export const xmcpStdioPath = resolve(generatedRoot, 'stdio.js');
