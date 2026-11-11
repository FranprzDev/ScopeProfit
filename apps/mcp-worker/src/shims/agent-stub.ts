/**
 * AgentService replacement for the Worker bundle. The real service runs the LangGraph brief
 * agent on the API server (Postgres checkpointer, LLM calls) which cannot run inside a
 * Worker. The MCP tools only call `enqueue`, a plain status update, so the worker performs
 * the same update; the LLM analysis itself does not run in this deployment and agentStatus
 * stays "pending" until an API server processes it.
 */
import { ProjectStatus } from '@prisma/client';
import type { PrismaService } from './prisma';

export class AgentService {
  constructor(private readonly db: PrismaService) {}

  async enqueue(id: string) {
    await this.db.project.updateMany({
      where: {
        id,
        status: {
          notIn: [ProjectStatus.approved, ProjectStatus.delivered, ProjectStatus.archived],
        },
        agentStatus: { not: 'running' },
      },
      data: { agentStatus: 'pending', agentError: null },
    });
  }

  async tick() {
    // The LangGraph agent loop only runs on the Nest API server.
  }
}
