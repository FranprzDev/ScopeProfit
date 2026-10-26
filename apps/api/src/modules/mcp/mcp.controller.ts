import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { McpService } from './mcp.service';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

@Controller('mcp')
export class McpController {
  constructor(
    private auth: AuthService,
    private mcp: McpService,
  ) {}

  @Get()
  health(@Res() res: Response) {
    res.status(200).json({ name: 'presu-mcp', status: 'ok' });
  }

  @Post()
  async handle(@Req() req: Request, @Body() body: unknown, @Res() res: Response) {
    const rpc = (body && typeof body === 'object' ? body : {}) as JsonRpcRequest;
    const id = rpc.id ?? null;
    const method = rpc.method ?? '';

    if (method === 'initialize') {
      res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'presu-mcp', version: '0.1.0' },
        },
      });
      return;
    }

    const user = await this.mcp.extractUser(req);
    if (!user) {
      res.status(401).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32001, message: 'Unauthorized: Bearer session token required' },
      });
      return;
    }

    try {
      if (method === 'tools/list') {
        res.status(200).json({ jsonrpc: '2.0', id, result: { tools: this.mcp.tools() } });
        return;
      }
      if (method === 'tools/call') {
        const params = (rpc.params && typeof rpc.params === 'object' ? rpc.params : {}) as {
          name?: string;
          arguments?: Record<string, unknown>;
        };
        const name = params.name ?? '';
        const args = params.arguments ?? {};
        const result = await this.mcp.callTool(user, name, args);
        res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: false,
          },
        });
        return;
      }
      if (method === 'ping') {
        res.status(200).json({ jsonrpc: '2.0', id, result: {} });
        return;
      }
      res.status(200).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error';
      res.status(200).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message },
      });
    }
  }
}
