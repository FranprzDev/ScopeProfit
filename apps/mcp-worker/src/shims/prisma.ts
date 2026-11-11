/**
 * PrismaService for the Worker bundle: the workerd generated client (pure-TS query compiler)
 * over Neon's serverless driver, which speaks to Postgres over WebSockets and works on
 * Cloudflare Workers. Replaces apps/api/src/prisma.service.ts via path substitution.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

export class PrismaService extends PrismaClient {
  constructor(connectionString: string) {
    super({ adapter: new PrismaNeon({ connectionString }) });
  }
  // Shape parity with apps/api/src/prisma.service.ts (Nest lifecycle hooks, unused here).
  async onModuleInit() {}
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
