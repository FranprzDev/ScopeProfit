import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ok } from './response';

@Controller('health')
export class HealthController {
  constructor(private db: PrismaService) {}

  @Get() async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'unreachable' });
    }
    return ok({ status: 'ok', database: 'up' });
  }
}
